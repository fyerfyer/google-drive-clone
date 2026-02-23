/**
 * Base Agent 基类
 *
 * - 使用 MemoryManager 构建 LLM 消息（含摘要 + 滑动窗口 + 任务计划）
 * - 将 MCP 工具转换为 OpenAI 的函数调用格式
 * - 运行 Agent 循环（LLM -> 工具 -> LLM -> …）
 * - Gateway 集成
 */

import { McpClientService, McpToolDefinition } from "../mcp-client.service";
import { CapabilityGateway } from "./capability-gateway";
import { MemoryManager } from "./memory-manager";
import { IMessage, IToolCall } from "../../models/Conversation.model";
import { AppError } from "../../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { config } from "../../config/env";
import { logger } from "../../lib/logger";
import {
  AgentType,
  AgentContext,
  LlmMessage,
  LlmTool,
  LlmResponse,
  GatewayDecision,
  ConversationSummary,
  TaskPlan,
  AgentEventCallback,
  MAX_TOOL_CALLS_PER_TURN,
  MAX_TOOL_RESULT_CHARS,
  AGENT_EVENT_TYPE,
} from "./agent.types";

export interface AgentRunOptions {
  existingSummaries?: ConversationSummary[];
  activePlan?: TaskPlan;
  onEvent?: AgentEventCallback;
  // 用于 disconnect 后终止未完成的 Tool Call 等操作
  signal?: AbortSignal;
}

export interface AgentLoopResult {
  content: string;
  toolCalls: IToolCall[];
  pendingApprovals: Array<{
    approvalId: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
  }>;
  // 更新后的摘要（用于持久化）
  updatedSummaries: ConversationSummary[];
  // 更新后的任务计划
  updatedPlan?: TaskPlan;
}

interface LoopResult {
  content: string;
  toolCalls: IToolCall[];
  pendingApprovals: AgentLoopResult["pendingApprovals"];
}

export abstract class BaseAgent {
  protected memoryManager: MemoryManager;

  constructor(
    protected mcpClient: McpClientService,
    protected gateway: CapabilityGateway,
  ) {
    this.memoryManager = new MemoryManager();
  }

  abstract readonly agentType: AgentType;

  abstract getSystemPrompt(context: AgentContext): string;

  abstract getAllowedTools(): Set<string>;

  abstract enrichContext(context: AgentContext): Promise<AgentContext>;

  async run(
    context: AgentContext,
    messages: IMessage[],
    conversationId: string,
    options?: AgentRunOptions,
  ): Promise<AgentLoopResult> {
    const enrichedCtx = await this.enrichContext(context);

    // 通过 MemoryManager 构建记忆状态
    const memoryState = await this.memoryManager.buildMemoryState(
      messages,
      options?.existingSummaries || [],
      options?.activePlan,
    );

    const allTools = await this.mcpClient.listTools();
    const allowedNames = this.getAllowedTools();
    const agentTools = allTools.filter((t) => allowedNames.has(t.name));
    const llmTools = this.buildLlmTools(agentTools);

    // 使用 MemoryManager 组装消息
    const systemPrompt = this.getSystemPrompt(enrichedCtx);
    const llmMessages = this.memoryManager.assembleLlmMessages(
      systemPrompt,
      memoryState,
    );

    const result = await this.runAgentLoop(
      llmMessages,
      llmTools,
      enrichedCtx,
      conversationId,
      options?.onEvent,
      options?.signal,
    );

    return {
      ...result,
      updatedSummaries: memoryState.summaries,
      updatedPlan: memoryState.activePlan,
    };
  }

  // Agent Loop
  private async runAgentLoop(
    messages: LlmMessage[],
    tools: LlmTool[],
    context: AgentContext,
    conversationId: string,
    onEvent?: AgentEventCallback,
    signal?: AbortSignal,
  ): Promise<LoopResult> {
    const allToolCalls: IToolCall[] = [];
    const pendingApprovals: AgentLoopResult["pendingApprovals"] = [];
    let iteration = 0;

    while (iteration < MAX_TOOL_CALLS_PER_TURN) {
      iteration++;
      this.memoryManager.compressIfNeeded(messages);

      const response = await this.callLlm(messages, tools);
      const choice = response.choices[0];

      if (!choice) {
        return {
          content:
            "I apologize, but I received an empty response. Please try again.",
          toolCalls: allToolCalls,
          pendingApprovals,
        };
      }

      const assistantMsg = choice.message;

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        const content = assistantMsg.content || "Done.";
        onEvent?.({ type: AGENT_EVENT_TYPE.CONTENT, data: { content } });
        return {
          content,
          toolCalls: allToolCalls,
          pendingApprovals,
        };
      }

      messages.push(assistantMsg);

      // 通过 Gateway 执行调用
      for (const toolCall of assistantMsg.tool_calls) {
        const { name, arguments: argsStr } = toolCall.function;

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(argsStr);
        } catch {
          args = {};
        }

        args.userId = context.userId;

        // 发送 Tool Call Start event
        onEvent?.({
          type: AGENT_EVENT_TYPE.TOOL_CALL_START,
          data: {
            toolName: name,
            args: Object.fromEntries(
              Object.entries(args).filter(([k]) => k !== "userId"),
            ),
          },
        });

        const decision: GatewayDecision = this.gateway.checkToolPermission(
          this.agentType,
          name,
          context.userId,
          conversationId,
          args,
        );

        let result: string;
        let isError = false;

        if (!decision.allowed && decision.requiresApproval) {
          // Emit approval event
          // 前端接收到这个会渲染 Approve 卡片
          onEvent?.({
            type: AGENT_EVENT_TYPE.APPROVAL_NEEDED,
            data: {
              approvalId: decision.approvalId,
              toolName: name,
              reason: decision.reason,
              args: Object.fromEntries(
                Object.entries(args).filter(([k]) => k !== "userId"),
              ),
            },
          });

          logger.info(
            { toolName: name, approvalId: decision.approvalId },
            "Dangerous operation intercepted, waiting for user approval inline",
          );

          // 在 SSE 流中等待用户审批
          const resolution = await this.gateway.waitForApproval(
            decision.approvalId!,
            signal,
          );

          // 清理 approval 记录
          this.gateway.consumeApproval(decision.approvalId!);

          if (resolution.approved) {
            // 合并用户修改的参数（如 share 权限等）
            const finalArgs = resolution.modifiedArgs
              ? { ...args, ...resolution.modifiedArgs, userId: context.userId }
              : args;

            logger.info(
              {
                toolName: name,
                approvalId: decision.approvalId,
                hasModifiedArgs: !!resolution.modifiedArgs,
              },
              "Approval granted, executing tool",
            );

            onEvent?.({
              type: AGENT_EVENT_TYPE.APPROVAL_RESOLVED,
              data: {
                approvalId: decision.approvalId,
                approved: true,
              },
            });

            try {
              const toolResult = await this.mcpClient.callTool(name, finalArgs);
              result = toolResult.content.map((c) => c.text).join("\n");
              isError = toolResult.isError || false;
            } catch (error) {
              result = `Tool execution error: ${error instanceof Error ? error.message : "Unknown error"}`;
              isError = true;
              logger.error(
                { error, tool: name },
                "Approved tool execution failed",
              );
            }
          } else {
            result = `[REJECTED] Operation '${name}' was rejected by the user or timed out.`;
            isError = false;

            onEvent?.({
              type: AGENT_EVENT_TYPE.APPROVAL_RESOLVED,
              data: {
                approvalId: decision.approvalId,
                approved: false,
              },
            });

            logger.info(
              { toolName: name, approvalId: decision.approvalId },
              "Operation rejected by user",
            );
          }
        } else if (!decision.allowed) {
          result = `[BLOCKED] ${decision.reason}`;
          isError = true;

          logger.warn(
            { toolName: name, agentType: this.agentType },
            "Tool call blocked by gateway",
          );
        } else {
          try {
            const toolResult = await this.mcpClient.callTool(name, args);
            result = toolResult.content.map((c) => c.text).join("\n");
            isError = toolResult.isError || false;
          } catch (error) {
            result = `Tool execution error: ${error instanceof Error ? error.message : "Unknown error"}`;
            isError = true;
            logger.error({ error, tool: name, args }, "Agent tool call failed");
          }
        }

        if (result.length > MAX_TOOL_RESULT_CHARS) {
          const originalLen = result.length;
          result =
            result.slice(0, MAX_TOOL_RESULT_CHARS) +
            `\n\n[Truncated: ${MAX_TOOL_RESULT_CHARS} of ${originalLen} chars]`;
        }

        allToolCalls.push({ toolName: name, args, result, isError });

        onEvent?.({
          type: AGENT_EVENT_TYPE.TOOL_CALL_END,
          data: {
            toolName: name,
            args: Object.fromEntries(
              Object.entries(args).filter(([k]) => k !== "userId"),
            ),
            result,
            isError,
          },
        });

        messages.push({
          role: "tool",
          content: result,
          tool_call_id: toolCall.id,
        });
      }
    }

    return {
      content:
        "I've reached the maximum number of operations in a single turn. Please continue with additional instructions.",
      toolCalls: allToolCalls,
      pendingApprovals,
    };
  }

  protected async callLlm(
    messages: LlmMessage[],
    tools: LlmTool[],
  ): Promise<LlmResponse> {
    const apiKey = config.llmApiKey;
    const baseUrl = config.llmBaseUrl;
    const model = config.llmModel;

    if (!apiKey) {
      throw new AppError(
        StatusCodes.SERVICE_UNAVAILABLE,
        "AI Agent is not configured. Please set LLM_API_KEY environment variable.",
      );
    }

    const body = {
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      temperature: 0.3,
      max_tokens: 4096,
    };

    logger.debug(
      { model, messageCount: messages.length, toolCount: tools.length },
      "Calling LLM",
    );

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { status: response.status, error: errorText },
        "LLM API error",
      );
      throw new AppError(
        StatusCodes.BAD_GATEWAY,
        `AI service returned error: ${response.status}`,
      );
    }

    return (await response.json()) as LlmResponse;
  }

  protected buildLlmTools(tools: McpToolDefinition[]): LlmTool[] {
    return tools.map((tool) => {
      const schema = { ...tool.inputSchema };
      if (schema.properties && typeof schema.properties === "object") {
        const props = { ...(schema.properties as Record<string, unknown>) };
        delete props.userId;
        schema.properties = props;
      }
      if (Array.isArray(schema.required)) {
        schema.required = (schema.required as string[]).filter(
          (r) => r !== "userId",
        );
      }

      return {
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: schema,
        },
      };
    });
  }
}
