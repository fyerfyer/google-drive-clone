/**
 * Task Orchestrator — 纯串行编排器
 *
 * 当 TaskPlan 涉及多步骤时，由 Orchestrator 统一调度：
 *   1. 按步骤 id 从 1 到 N 严格顺序执行
 *   2. 根据 step.agentType 选择对应 Agent
 *   3. 构建包含前序结果的上下文，让当前 Agent 知晓前面步骤的产出
 *   4. 收集所有步骤的 toolCalls / summaries
 *   5. 遇到 pendingApproval 时暂停编排
 *   6. 如果某一步失败（且达到重试上限），直接终止整个 Plan 执行
 *
 *   每个步骤通过 BaseAgent.run() 执行，Orchestrator 仅负责
 *   选谁执行、传什么上下文、如何推进。
 */

import { BaseAgent, AgentLoopResult } from "./base-agent";
import { TaskPlanTracker } from "./task-planner";
import {
  AgentContext,
  AgentType,
  TaskPlan,
  TaskStep,
  ConversationSummary,
  MAX_TOOL_RETRIES,
  AgentEventCallback,
  TASK_STATUS,
  AGENT_EVENT_TYPE,
} from "./agent.types";
import { IMessage, IToolCall } from "../../models/Conversation.model";
import { logger } from "../../lib/logger";
import {
  storeEphemeral,
  CONTEXT_OFFLOAD_THRESHOLD_CHARS,
  EphemeralItem,
} from "./ephemeral-store";

export interface StepResult {
  step: TaskStep;
  content: string;
  toolCalls: IToolCall[];
  pendingApprovals: AgentLoopResult["pendingApprovals"];
  success: boolean;
  error?: string;
  ephemeralId?: string;
}

export interface OrchestratorResult {
  // 最终组合后的回复内容
  content: string;
  // 更新后的 TaskPlan（含各步骤状态）
  plan: TaskPlan;
  // 所有步骤合并的 toolCalls
  toolCalls: IToolCall[];
  // 所有步骤合并的 pendingApprovals
  pendingApprovals: AgentLoopResult["pendingApprovals"];
  // 最后一轮 Agent 返回的摘要
  updatedSummaries: ConversationSummary[];
  // 每个步骤的独立结果
  stepResults: StepResult[];
}

export class TaskOrchestrator {
  private taskTracker: TaskPlanTracker;

  // 缓存 enrichment 结果，key "agentType:folderId"
  // 避免对同一 agentType 在同一 folderId 上重复调用 MCP 工具
  private enrichmentCache = new Map<string, Partial<AgentContext>>();

  constructor(private agents: Record<AgentType, BaseAgent>) {
    this.taskTracker = new TaskPlanTracker();
  }

  // 如果 plan 中包含 >=2 种 agentType，则需要 Orchestrator 调度
  needsOrchestration(plan: TaskPlan): boolean {
    const types = new Set<AgentType>();
    for (const step of plan.steps) {
      if (step.agentType) types.add(step.agentType);
    }
    // 即使只有一种 agentType，步骤 > 1 时也用 Orchestrator
    // 这样可以统一处理步骤间的上下文传递和结果汇总逻辑
    return types.size > 1 || plan.steps.length > 1;
  }

  async executePlan(
    plan: TaskPlan,
    baseContext: AgentContext,
    originalMessages: IMessage[],
    conversationId: string,
    existingSummaries: ConversationSummary[],
    onEvent?: AgentEventCallback,
    signal?: AbortSignal,
    taskId?: string,
  ): Promise<OrchestratorResult> {
    let currentPlan = this.deepClonePlan(plan);
    const allToolCalls: IToolCall[] = [];
    const stepResults: StepResult[] = [];
    let updatedSummaries = [...existingSummaries];
    this.enrichmentCache.clear();

    logger.info(
      {
        goal: currentPlan.goal,
        totalSteps: currentPlan.steps.length,
        agentTypes: [
          ...new Set(currentPlan.steps.map((s) => s.agentType).filter(Boolean)),
        ],
      },
      "Orchestrator: starting serial plan execution",
    );

    // 按步骤 id 顺序严格串行执行
    for (const step of currentPlan.steps) {
      // 只执行待处理的步骤（跳过已完成/已失败的步骤，支持恢复）
      if (step.status !== TASK_STATUS.PENDING) continue;

      // 检查 abort 信号
      if (signal?.aborted) {
        step.status = TASK_STATUS.SKIPPED;
        step.error = "Aborted by user";
        onEvent?.({
          type: AGENT_EVENT_TYPE.TASK_STEP_UPDATE,
          data: {
            stepId: step.id,
            status: TASK_STATUS.SKIPPED,
            error: step.error,
          },
        });
        continue;
      }

      currentPlan.currentStep = step.id;

      const result = await this.executeStep(
        step,
        currentPlan,
        baseContext,
        originalMessages,
        conversationId,
        updatedSummaries,
        stepResults,
        onEvent,
        signal,
        taskId,
      );

      if (result.success) {
        step.status = TASK_STATUS.COMPLETED;
        step.result = result.content.slice(0, 200);
        allToolCalls.push(...result.toolCalls);

        // 检查是否需要将大结果卸载到临时存储
        if (result.content.length > CONTEXT_OFFLOAD_THRESHOLD_CHARS) {
          const items: EphemeralItem[] = [
            {
              label: `Step ${step.id}: ${step.title}`,
              content: result.content,
              meta: { stepId: step.id, agentType: step.agentType },
            },
          ];
          const ephId = storeEphemeral(result.content, items, {
            sourceType: "batch_results",
            itemCount: 1,
            totalChars: result.content.length,
            description: `Result from Step ${step.id}: ${step.title}`,
          });
          result.ephemeralId = ephId;
          logger.info(
            { ephemeralId: ephId, chars: result.content.length },
            "Orchestrator: step result offloaded to ephemeral store",
          );
        }

        onEvent?.({
          type: AGENT_EVENT_TYPE.TASK_STEP_UPDATE,
          data: {
            stepId: step.id,
            status: TASK_STATUS.COMPLETED,
            result: step.result,
          },
        });
      } else {
        step.status = TASK_STATUS.FAILED;
        step.error = result.error;

        onEvent?.({
          type: AGENT_EVENT_TYPE.TASK_STEP_UPDATE,
          data: {
            stepId: step.id,
            status: TASK_STATUS.FAILED,
            error: result.error,
          },
        });

        // 串行模式下，某一步失败直接终止整个 Plan
        logger.warn(
          { stepId: step.id, error: result.error },
          "Orchestrator: step failed, terminating plan execution",
        );

        // 标记所有后续步骤为跳过
        for (const remaining of currentPlan.steps) {
          if (
            remaining.status === TASK_STATUS.PENDING &&
            remaining.id > step.id
          ) {
            remaining.status = TASK_STATUS.SKIPPED;
            remaining.error = `Skipped: previous Step ${step.id} failed`;
            onEvent?.({
              type: AGENT_EVENT_TYPE.TASK_STEP_UPDATE,
              data: {
                stepId: remaining.id,
                status: TASK_STATUS.SKIPPED,
                error: remaining.error,
              },
            });
          }
        }

        stepResults.push(result);
        if (result.updatedSummaries) {
          updatedSummaries = result.updatedSummaries;
        }
        break; // 终止 Plan
      }

      stepResults.push(result);
      if (result.updatedSummaries) {
        updatedSummaries = result.updatedSummaries;
      }
    }

    currentPlan.isComplete = true;

    const content = this.buildFinalResponse(currentPlan, stepResults);

    return {
      content,
      plan: currentPlan,
      toolCalls: allToolCalls,
      pendingApprovals: [],
      updatedSummaries,
      stepResults,
    };
  }

  private async executeStep(
    step: TaskStep,
    currentPlan: TaskPlan,
    baseContext: AgentContext,
    originalMessages: IMessage[],
    conversationId: string,
    existingSummaries: ConversationSummary[],
    previousResults: StepResult[],
    onEvent?: AgentEventCallback,
    signal?: AbortSignal,
    taskId?: string,
  ): Promise<StepResult & { updatedSummaries?: ConversationSummary[] }> {
    const agentType = step.agentType || baseContext.type;
    const agent = this.agents[agentType];

    if (!agent) {
      logger.error(
        { agentType, stepId: step.id },
        "Orchestrator: no agent available for step",
      );

      onEvent?.({
        type: AGENT_EVENT_TYPE.TASK_STEP_UPDATE,
        data: {
          stepId: step.id,
          status: TASK_STATUS.FAILED,
          error: `No agent for type: ${agentType}`,
        },
      });

      return {
        step,
        content: "",
        toolCalls: [],
        pendingApprovals: [],
        success: false,
        error: `No agent for type: ${agentType}`,
      };
    }

    step.status = TASK_STATUS.IN_PROGRESS;
    onEvent?.({
      type: AGENT_EVENT_TYPE.TASK_STEP_UPDATE,
      data: {
        stepId: step.id,
        status: TASK_STATUS.IN_PROGRESS,
        title: step.title,
      },
    });

    const folderId = baseContext.folderId || "root";
    const cacheKey = `${agentType}:${folderId}`;
    let stepContext: AgentContext;
    let skipEnrichment = false;

    if (this.enrichmentCache.has(cacheKey)) {
      stepContext = {
        ...this.buildStepContext(baseContext, step, agentType),
        ...this.enrichmentCache.get(cacheKey)!,
      };
      skipEnrichment = true;
      logger.debug(
        { stepId: step.id, cacheKey },
        "Orchestrator: reusing cached enrichment for step",
      );
    } else {
      const rawContext = this.buildStepContext(baseContext, step, agentType);
      stepContext = await agent.enrichContext(rawContext);
      this.enrichmentCache.set(cacheKey, {
        workspaceSnapshot: stepContext.workspaceSnapshot,
        folderPath: stepContext.folderPath,
        relatedContext: stepContext.relatedContext,
        documentContent: stepContext.documentContent,
        documentName: stepContext.documentName,
      });
      skipEnrichment = true;
    }

    const stepMessages = this.buildStepMessages(
      originalMessages,
      step,
      previousResults,
      currentPlan,
    );

    logger.info(
      {
        stepId: step.id,
        title: step.title,
        agentType,
        messageCount: stepMessages.length,
      },
      "Orchestrator: executing step",
    );

    let lastError = "";
    for (let attempt = 0; attempt <= MAX_TOOL_RETRIES; attempt++) {
      try {
        const retryMessages =
          attempt > 0
            ? [
                ...stepMessages,
                {
                  role: "user" as const,
                  content: `Previous attempt failed: ${lastError}. Please retry with a different approach. Attempt ${attempt + 1} of ${MAX_TOOL_RETRIES + 1}.`,
                  timestamp: new Date(),
                },
              ]
            : stepMessages;

        const result = await agent.run(
          stepContext,
          retryMessages,
          conversationId,
          {
            existingSummaries,
            activePlan: currentPlan,
            onEvent,
            signal,
            taskId,
            stepId: step.id,
            skipEnrichment,
          },
        );

        const hasOnlyErrors =
          result.toolCalls.length > 0 &&
          result.toolCalls.every((tc) => tc.isError);

        if (hasOnlyErrors && attempt < MAX_TOOL_RETRIES) {
          lastError = result.toolCalls
            .filter((tc) => tc.isError)
            .map((tc) => tc.result || "Unknown error")
            .join("; ");
          logger.warn(
            { stepId: step.id, attempt: attempt + 1, error: lastError },
            "Orchestrator: step had only errors, retrying",
          );
          continue;
        }

        logger.info(
          {
            stepId: step.id,
            toolCallCount: result.toolCalls.length,
            contentLength: result.content.length,
            attempts: attempt + 1,
          },
          "Orchestrator: step completed",
        );

        return {
          step,
          content: result.content,
          toolCalls: result.toolCalls,
          pendingApprovals: [],
          success: true,
          updatedSummaries: result.updatedSummaries,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { error, stepId: step.id, agentType, attempt: attempt + 1 },
          "Orchestrator: step execution failed",
        );

        if (attempt >= MAX_TOOL_RETRIES) break;
      }
    }

    return {
      step,
      content: "",
      toolCalls: [],
      pendingApprovals: [],
      success: false,
      error: `Failed after ${MAX_TOOL_RETRIES + 1} attempts: ${lastError}`,
    };
  }

  // 为当前步骤构建 AgentContext
  private buildStepContext(
    base: AgentContext,
    _step: TaskStep,
    agentType: AgentType,
  ): AgentContext {
    return {
      ...base,
      type: agentType,
    };
  }

  // 为当前步骤构建消息序列
  private buildStepMessages(
    originalMessages: IMessage[],
    currentStep: TaskStep,
    previousResults: StepResult[],
    plan: TaskPlan,
  ): IMessage[] {
    const messages: IMessage[] = [...originalMessages];

    // 注入前序结果
    if (previousResults.length > 0) {
      const summaryParts = previousResults.map((r) => {
        if (r.success) {
          if (r.ephemeralId) {
            return (
              `[Step ${r.step.id}] ✅ ${r.step.title}: ${r.content.slice(0, 150)}\n` +
              `  ⚠️ Full data offloaded to ephemeral memory: Reference ID = "${r.ephemeralId}"\n` +
              `  Use 'query_ephemeral_memory' to look up specific items, or 'map_reduce_summarize' for a full summary.`
            );
          }
          return `[Step ${r.step.id}] ✅ ${r.step.title}: ${r.content.slice(0, 300)}`;
        } else {
          return `[Step ${r.step.id}] ❌ ${r.step.title}: ${r.error || "Failed"}`;
        }
      });

      const offloadedIds = new Set(
        previousResults.filter((r) => r.ephemeralId).map((r) => r.ephemeralId!),
      );

      let assistantContent = `I've completed the following steps so far:\n\n${summaryParts.join("\n\n")}`;

      if (offloadedIds.size > 0) {
        assistantContent +=
          `\n\n---\n**NOTE**: Some step results were too large for direct context injection and have been offloaded to ephemeral memory. ` +
          `Use the Reference IDs above with 'query_ephemeral_memory' or 'map_reduce_summarize' tools to access this data.`;
      }

      messages.push({
        role: "assistant" as const,
        content: assistantContent,
        timestamp: new Date(),
      });
    }

    // 注入当前步骤指令
    messages.push({
      role: "user" as const,
      content: [
        `[Task Plan — Step ${currentStep.id} of ${plan.steps.length}]`,
        `Goal: ${plan.goal}`,
        `Step: ${currentStep.title}`,
        `Instruction: ${currentStep.description}`,
        "",
        "Execute ONLY this step. Be concise — report the result in 1-2 sentences.",
      ].join("\n"),
      timestamp: new Date(),
    });

    return messages;
  }

  // 组装最终返回给用户的回复文本
  private buildFinalResponse(
    plan: TaskPlan,
    stepResults: StepResult[],
  ): string {
    const parts: string[] = [];

    const lastSuccess = [...stepResults].reverse().find((r) => r.success);
    if (lastSuccess) {
      parts.push(lastSuccess.content);
    } else if (stepResults.length > 0) {
      parts.push(
        "I encountered errors while executing the task plan. Here's what happened:",
      );
      for (const r of stepResults) {
        if (!r.success) {
          parts.push(
            `- Step ${r.step.id} (${r.step.title}): ${r.error || "Unknown error"}`,
          );
        }
      }
    }

    parts.push("");
    parts.push("---");
    parts.push(this.taskTracker.formatPlanForUser(plan));

    return parts.join("\n");
  }

  private deepClonePlan(plan: TaskPlan): TaskPlan {
    return {
      goal: plan.goal,
      steps: plan.steps.map((s) => ({ ...s })),
      currentStep: plan.currentStep,
      isComplete: plan.isComplete,
      summary: plan.summary,
    };
  }
}
