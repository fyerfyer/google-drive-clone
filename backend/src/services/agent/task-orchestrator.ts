/**
 * Task Orchestrator 多 Agent 任务编排器 (DAG 并行版)
 *
 * 当 TaskPlan 涉及多种 AgentType 的步骤时，由 Orchestrator 统一调度：
 *   1. 解析每个步骤的 dependencies 字段，构建 DAG
 *   2. 每轮迭代筛选所有依赖已完成的就绪节点，使用 Promise.all 并行执行
 *   3. 根据 step.agentType 选择对应 Agent
 *   4. 构建包含前序结果的上下文，让当前 Agent 知晓前面步骤的产出
 *   5. 收集所有步骤的 toolCalls / summaries
 *   6. 遇到 pendingApproval 时暂停编排
 *
 *   每个步骤仍通过 BaseAgent.run() 执行，Orchestrator 仅负责
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

export interface StepResult {
  step: TaskStep;
  content: string;
  toolCalls: IToolCall[];
  pendingApprovals: AgentLoopResult["pendingApprovals"];
  success: boolean;
  error?: string;
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

    // 通过当前 plan 状态构建 DAG
    // 这样之后可以直接恢复部分完成状态的 plan
    const completedStepIds = new Set<number>(
      currentPlan.steps
        .filter((s) => s.status === TASK_STATUS.COMPLETED)
        .map((s) => s.id),
    );
    const failedStepIds = new Set<number>(
      currentPlan.steps
        .filter((s) => s.status === TASK_STATUS.FAILED)
        .map((s) => s.id),
    );

    logger.info(
      {
        goal: currentPlan.goal,
        totalSteps: currentPlan.steps.length,
        agentTypes: [
          ...new Set(currentPlan.steps.map((s) => s.agentType).filter(Boolean)),
        ],
        hasDependencies: currentPlan.steps.some(
          (s) => s.dependencies && s.dependencies.length > 0,
        ),
      },
      "Orchestrator: starting DAG-based parallel plan execution",
    );

    while (true) {
      // 找到所有已完成的 step
      const readySteps = currentPlan.steps.filter((step) => {
        if (step.status !== TASK_STATUS.PENDING) return false;
        const deps = step.dependencies || [];
        return deps.every(
          (depId) => completedStepIds.has(depId) || failedStepIds.has(depId),
        );
      });

      if (readySteps.length === 0) break;

      logger.info(
        {
          readyCount: readySteps.length,
          readyIds: readySteps.map((s) => s.id),
        },
        "Orchestrator: parallel batch ready",
      );

      // 并发执行
      onEvent?.({
        type: AGENT_EVENT_TYPE.PARALLEL_BATCH,
        data: {
          stepIds: readySteps.map((s) => s.id),
          batchIndex: stepResults.length > 0 ? -1 : 0,
        },
      });

      const batchPromises = readySteps.map((step) =>
        this.executeStep(
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
        ),
      );

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        const step = currentPlan.steps.find((s) => s.id === result.step.id)!;

        if (result.success) {
          step.status = TASK_STATUS.COMPLETED;
          step.result = result.content.slice(0, 200);
          completedStepIds.add(step.id);
          allToolCalls.push(...result.toolCalls);

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
          failedStepIds.add(step.id);

          onEvent?.({
            type: AGENT_EVENT_TYPE.TASK_STEP_UPDATE,
            data: {
              stepId: step.id,
              status: TASK_STATUS.FAILED,
              error: result.error,
            },
          });
        }

        stepResults.push(result);
        if (result.updatedSummaries) {
          updatedSummaries = result.updatedSummaries;
        }
      }

      const nextPending = currentPlan.steps.find(
        (s) => s.status === TASK_STATUS.PENDING,
      );
      if (nextPending) {
        currentPlan.currentStep = nextPending.id;
      } else {
        currentPlan.isComplete = true;
      }
    }

    // 跳过所有不可达 step
    for (const step of currentPlan.steps) {
      if (step.status === TASK_STATUS.PENDING) {
        step.status = TASK_STATUS.SKIPPED;
        step.error = "Skipped due to failed dependencies";
        onEvent?.({
          type: AGENT_EVENT_TYPE.TASK_STEP_UPDATE,
          data: {
            stepId: step.id,
            status: TASK_STATUS.SKIPPED,
            error: step.error,
          },
        });
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

    const stepContext = this.buildStepContext(baseContext, step, agentType);
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
        dependencies: step.dependencies,
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

  // 为当前步骤构建 AgentContext。
  // 保留原始 userId / folderId / fileId，但切换 type 到步骤指定的 agent。
  private buildStepContext(
    base: AgentContext,
    step: TaskStep,
    agentType: AgentType,
  ): AgentContext {
    return {
      ...base,
      type: agentType,
    };
  }

  // 为当前步骤构建消息序列：
  // 1. 原始对话历史（MemoryManager 处理）
  // 2. 前序步骤结果（作为一条合成 assistant 消息，让 Agent 知道之前做了什么）
  // 3. 当前步骤指令（作为一条合成 user 消息）
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
          return `[Step ${r.step.id}] ✅ ${r.step.title}: ${r.content.slice(0, 300)}`;
        } else {
          return `[Step ${r.step.id}] ❌ ${r.step.title}: ${r.error || "Failed"}`;
        }
      });

      messages.push({
        role: "assistant" as const,
        content: `I've completed the following steps so far:\n\n${summaryParts.join("\n\n")}`,
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

  // 组装最终返回给用户的回复文本。
  // 以最后一个成功步骤的 content 为主体，附加任务计划进度。
  private buildFinalResponse(
    plan: TaskPlan,
    stepResults: StepResult[],
  ): string {
    const parts: string[] = [];

    // 选取最后一个成功步骤的回复作为主体
    const lastSuccess = [...stepResults].reverse().find((r) => r.success);
    if (lastSuccess) {
      parts.push(lastSuccess.content);
    } else if (stepResults.length > 0) {
      // 全部失败
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

    // 附加进度
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
