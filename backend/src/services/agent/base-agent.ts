/**
 * Base Agent 基类
 *
 * - 从会话历史构建 LLM 消息
 * - 将 MCP 工具转换为 OpenAI 的函数调用格式
 * - 运行Agent循环（LLM -> 工具 -> LLM -> …）
 * - 上下文窗口压缩
 * - Gateway 集成
 */

import { McpClientService, McpToolDefinition } from "../mcp-client.service";
import { CapabilityGateway } from "./capability-gateway";
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
  MAX_TOOL_CALLS_PER_TURN,
  MAX_CONTEXT_CHARS,
  MAX_TOOL_RESULT_CHARS,
} from "./agent.types";

export interface AgentLoopResult {
  content: string;
  toolCalls: IToolCall[];
  pendingApprovals: Array<{
    approvalId: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
  }>;
}

export abstract class BaseAgent {
  constructor(
    protected mcpClient: McpClientService,
    protected gateway: CapabilityGateway,
  ) {}

  abstract readonly agentType: AgentType;

  abstract getSystemPrompt(context: AgentContext): string;

  abstract getAllowedTools(): Set<string>;

  // 根据当前上下文丰富信息
  abstract enrichContext(context: AgentContext): Promise<AgentContext>;

  async run(
    context: AgentContext,
    messages: IMessage[],
    conversationId: string,
  ): Promise<AgentLoopResult> {
    const enrichedCtx = await this.enrichContext(context);

    const allTools = await this.mcpClient.listTools();
    const allowedNames = this.getAllowedTools();
    const agentTools = allTools.filter((t) => allowedNames.has(t.name));
    const llmTools = this.buildLlmTools(agentTools);
    const llmMessages = this.buildLlmMessages(messages, enrichedCtx);

    return this.runAgentLoop(
      llmMessages,
      llmTools,
      enrichedCtx,
      conversationId,
    );
  }

  // Agent Loop
  private async runAgentLoop(
    messages: LlmMessage[],
    tools: LlmTool[],
    context: AgentContext,
    conversationId: string,
  ): Promise<AgentLoopResult> {
    const allToolCalls: IToolCall[] = [];
    const pendingApprovals: AgentLoopResult["pendingApprovals"] = [];
    let iteration = 0;

    while (iteration < MAX_TOOL_CALLS_PER_TURN) {
      iteration++;
      this.compressMessagesIfNeeded(messages);

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
        return {
          content: assistantMsg.content || "Done.",
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
          pendingApprovals.push({
            approvalId: decision.approvalId!,
            toolName: name,
            args,
            reason: decision.reason!,
          });

          result = `[APPROVAL REQUIRED] This operation requires user approval: ${decision.reason}. The user has been notified and needs to approve before this action can proceed.`;
          isError = false; // Not an error, just pending

          logger.info(
            { toolName: name, approvalId: decision.approvalId },
            "Dangerous operation intercepted, awaiting approval",
          );
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

  protected buildLlmMessages(
    messages: IMessage[],
    context: AgentContext,
  ): LlmMessage[] {
    const systemPrompt = this.getSystemPrompt(context);

    const llmMessages: LlmMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];

    for (const msg of messages) {
      if (msg.role === "user") {
        llmMessages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        llmMessages.push({ role: "assistant", content: msg.content });
      }
    }

    return llmMessages;
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

  private estimateMessageChars(messages: LlmMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      if (msg.content) total += msg.content.length;
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          total += tc.function.arguments.length + tc.function.name.length;
        }
      }
    }
    return total;
  }

  private compressMessagesIfNeeded(messages: LlmMessage[]): void {
    let totalChars = this.estimateMessageChars(messages);

    if (totalChars <= MAX_CONTEXT_CHARS) return;

    logger.info(
      { totalChars, limit: MAX_CONTEXT_CHARS },
      "Context approaching limit, compressing message history",
    );

    const KEEP_RECENT = 6;
    const shrinkBound = Math.max(1, messages.length - KEEP_RECENT);

    for (let i = 1; i < shrinkBound && totalChars > MAX_CONTEXT_CHARS; i++) {
      const msg = messages[i];
      if (msg.role === "tool" && msg.content && msg.content.length > 200) {
        const oldLen = msg.content.length;
        msg.content =
          msg.content.slice(0, 150) +
          `\n[...compressed — original ${oldLen} chars]`;
        totalChars -= oldLen - msg.content.length;
      }
    }

    if (totalChars <= MAX_CONTEXT_CHARS) return;

    while (
      messages.length > KEEP_RECENT + 1 &&
      totalChars > MAX_CONTEXT_CHARS
    ) {
      const removed = messages.splice(1, 1)[0];
      if (removed.content) totalChars -= removed.content.length;
    }

    logger.info(
      { newTotalChars: totalChars, messageCount: messages.length },
      "Context compressed",
    );
  }
}
