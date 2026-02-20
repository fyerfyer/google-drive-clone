/**
 * Task Orchestrator 多 Agent 任务编排器
 *
 * 当 TaskPlan 涉及多种 AgentType 的步骤时，由 Orchestrator 统一调度：
 *   1. 遍历 plan.steps
 *   2. 根据 step.agentType 选择对应 Agent
 *   3. 构建包含前序结果的上下文，让当前 Agent 知晓前面步骤的产出
 *   4. 收集所有步骤的 toolCalls / pendingApprovals / summaries
 *   5. 遇到 pendingApproval 时暂停编排（需要用户确认后再继续）
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

  // 如果 plan 中包含 >=2 种 agentType，则需要 Orchestrator 调度；
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
  ): Promise<OrchestratorResult> {
    let currentPlan = this.deepClonePlan(plan);
    const allToolCalls: IToolCall[] = [];
    const allPendingApprovals: AgentLoopResult["pendingApprovals"] = [];
    const stepResults: StepResult[] = [];
    let updatedSummaries = [...existingSummaries];

    logger.info(
      {
        goal: currentPlan.goal,
        totalSteps: currentPlan.steps.length,
        agentTypes: [
          ...new Set(currentPlan.steps.map((s) => s.agentType).filter(Boolean)),
        ],
      },
      "Orchestrator: starting multi-agent plan execution",
    );

    for (const step of currentPlan.steps) {
      // 只处理待执行的步骤
      if (step.status !== "pending") continue;

      const agentType = step.agentType || baseContext.type;
      const agent = this.agents[agentType];

      if (!agent) {
        logger.error(
          { agentType, stepId: step.id },
          "Orchestrator: no agent available for step",
        );
        currentPlan = this.taskTracker.failCurrentStep(
          currentPlan,
          `No agent available for type: ${agentType}`,
        );
        stepResults.push({
          step,
          content: "",
          toolCalls: [],
          pendingApprovals: [],
          success: false,
          error: `No agent for type: ${agentType}`,
        });
        continue;
      }

      // 标记当前步骤为进行中
      currentPlan = this.taskTracker.startCurrentStep(currentPlan);

      // 构建此步骤专属的上下文
      const stepContext = this.buildStepContext(baseContext, step, agentType);

      // 构建消息：原始历史 + 前序结果 + 当前步骤指令
      const stepMessages = this.buildStepMessages(
        originalMessages,
        step,
        stepResults,
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

      try {
        const result = await agent.run(
          stepContext,
          stepMessages,
          conversationId,
          {
            existingSummaries: updatedSummaries,
            activePlan: currentPlan,
          },
        );

        // 步骤成功
        currentPlan = this.taskTracker.completeCurrentStep(
          currentPlan,
          result.content.slice(0, 200),
        );

        allToolCalls.push(...result.toolCalls);
        allPendingApprovals.push(...result.pendingApprovals);
        updatedSummaries = result.updatedSummaries;

        stepResults.push({
          step,
          content: result.content,
          toolCalls: result.toolCalls,
          pendingApprovals: result.pendingApprovals,
          success: true,
        });

        logger.info(
          {
            stepId: step.id,
            toolCallCount: result.toolCalls.length,
            contentLength: result.content.length,
          },
          "Orchestrator: step completed",
        );

        // 如果步骤触发了 Approve 请求，暂停编排
        if (result.pendingApprovals.length > 0) {
          logger.info(
            { stepId: step.id, approvalCount: result.pendingApprovals.length },
            "Orchestrator: pausing — step requires user approval",
          );
          break;
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { error, stepId: step.id, agentType },
          "Orchestrator: step execution failed",
        );

        currentPlan = this.taskTracker.failCurrentStep(currentPlan, errMsg);

        stepResults.push({
          step,
          content: "",
          toolCalls: [],
          pendingApprovals: [],
          success: false,
          error: errMsg,
        });

        // 步骤失败后继续下一步
      }
    }

    const content = this.buildFinalResponse(currentPlan, stepResults);

    return {
      content,
      plan: currentPlan,
      toolCalls: allToolCalls,
      pendingApprovals: allPendingApprovals,
      updatedSummaries,
      stepResults,
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
          return `[Step ${r.step.id} — ${r.step.title}] ✅ Result:\n${r.content.slice(0, 800)}`;
        } else {
          return `[Step ${r.step.id} — ${r.step.title}] ❌ Failed: ${r.error || "Unknown"}`;
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
        `Overall goal: ${plan.goal}`,
        `Current step: ${currentStep.title}`,
        `Instruction: ${currentStep.description}`,
        "",
        "Please execute ONLY this step. Use the results from previous steps if needed.",
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
          parts.push(`- Step ${r.step.id} (${r.step.title}): ${r.error}`);
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
