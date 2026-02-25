/**
 * Agent Service
 *
 * 管理会话、确认流程、任务计划和 WebSocket 集成。
 *
 *   User Message
 *     -> shouldPlanTask
 *     -> TaskPlanner
 *     -> MemoryManager
 *     -> Hybrid Router
 *     -> TaskOrchestrator / 单 Agent 执行
 *     -> CapabilityGateway
 *     -> Response（任务进度 + 路由决策信息）
 */

import Conversation, {
  IConversation,
  IMessage,
  ITaskPlan,
  IToolCall,
} from "../models/Conversation.model";
import { McpClientService } from "./mcp-client.service";
import { DriveAgent } from "./agent/drive-agent";
import { DocumentAgent } from "./agent/document-agent";
import { SearchAgent } from "./agent/search-agent";
import { CapabilityGateway } from "./agent/capability-gateway";
import { MemoryManager } from "./agent/memory-manager";
import { routeToAgent } from "./agent/agent-router";
import {
  shouldPlanTask,
  generateTaskPlan,
  TaskPlanTracker,
} from "./agent/task-planner";
import { TaskOrchestrator } from "./agent/task-orchestrator";
import {
  AgentType,
  AgentContext,
  ApprovalRequest,
  RouteDecision,
  TaskPlan,
  AgentEventCallback,
  AgentStreamEvent,
  AGENT_EVENT_TYPE,
  AgentTaskData,
  AgentTaskResult,
  AgentTaskStatusResponse,
} from "./agent/agent.types";
import { BaseAgent } from "./agent/base-agent";
import { logger } from "../lib/logger";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { enqueueAgentTask, getAgentTaskStatus } from "./agent/agent-task-queue";

export interface AgentChatRequest {
  message: string;
  conversationId?: string;
  context?: {
    type?: AgentType;
    folderId?: string;
    fileId?: string;
  };
}

export interface AgentChatResponse {
  conversationId: string;
  agentType: AgentType;
  message: IMessage;
  routeDecision?: {
    confidence: number;
    source: string;
    reason: string;
  };
  taskPlan?: TaskPlan;
  pendingApprovals?: Array<{
    approvalId: string;
    toolName: string;
    reason: string;
  }>;
}

export interface ApprovalResponse {
  success: boolean;
  result?: {
    toolName: string;
    output: string;
    isError: boolean;
  };
  message: string;
  // Approve 后还有没有需要执行的步骤
  hasRemainingSteps?: boolean;
}

export interface ConversationListItem {
  id: string;
  title: string;
  agentType: AgentType;
  lastMessage: string;
  messageCount: number;
  updatedAt: Date;
}

export class AgentService {
  private driveAgent: DriveAgent;
  private documentAgent: DocumentAgent;
  private searchAgent: SearchAgent;
  private gateway: CapabilityGateway;
  private memoryManager: MemoryManager;
  private taskTracker: TaskPlanTracker;
  private orchestrator: TaskOrchestrator;

  constructor(private mcpClient: McpClientService) {
    this.gateway = new CapabilityGateway();
    this.memoryManager = new MemoryManager();
    this.taskTracker = new TaskPlanTracker();
    this.driveAgent = new DriveAgent(mcpClient, this.gateway);
    this.documentAgent = new DocumentAgent(mcpClient, this.gateway);
    this.searchAgent = new SearchAgent(mcpClient, this.gateway);
    this.orchestrator = new TaskOrchestrator({
      drive: this.driveAgent,
      document: this.documentAgent,
      search: this.searchAgent,
    });
  }

  // 将 Mongoose 的计划子文档转换为普通的 TaskPlan 对象。
  // Mongoose 的子文档不能使用展开运算符 ({...s}) —— 它们的字段内部
  // 存储在 _doc 中，只能通过 getter 或 toObject() 访问。
  private toPlainPlan(plan: ITaskPlan): TaskPlan {
    const raw =
      typeof (plan as any).toObject === "function"
        ? (plan as any).toObject()
        : plan;
    return {
      goal: raw.goal,
      steps: (raw.steps || []).map((s: any) => {
        const step = typeof s.toObject === "function" ? s.toObject() : s;
        return {
          id: step.id,
          title: step.title,
          description: step.description,
          status: step.status,
          agentType: step.agentType,
          result: step.result,
          error: step.error,
        };
      }),
      currentStep: raw.currentStep,
      isComplete: raw.isComplete,
      summary: raw.summary,
    };
  }

  private async chat(
    userId: string,
    request: AgentChatRequest,
    onEvent?: AgentEventCallback,
    signal?: AbortSignal,
  ): Promise<AgentChatResponse> {
    const { message, conversationId, context } = request;

    let conversation: IConversation;
    if (conversationId) {
      conversation = await this.getConversationOrThrow(conversationId, userId);
    } else {
      conversation = new Conversation({
        userId,
        messages: [],
        agentType: "drive",
        context: {},
        summaries: [],
      });
    }

    // 构建 MemoryState 用于 Router 上下文
    const memoryState = await this.memoryManager.buildMemoryState(
      conversation.messages,
      (conversation.summaries || []).map((s) => ({
        summary: s.summary,
        messageRange: s.messageRange,
        createdAt: s.createdAt,
      })),
      conversation.activePlan
        ? this.toPlainPlan(conversation.activePlan)
        : undefined,
    );

    const routerContext = this.memoryManager.getRouterContext(memoryState);

    // 当前面的 plan 已结束或首次对话时，不锁定会话类型
    const previousPlanDone =
      !conversation.activePlan || conversation.activePlan.isComplete;

    const routeDecision: RouteDecision = await routeToAgent({
      explicitType: context?.type,
      // 仅在有活跃 plan 未完成时继承会话类型，否则让 Router 重新判断
      conversationAgentType: previousPlanDone
        ? undefined
        : (conversation.agentType as AgentType),
      message,
      conversationContext: routerContext,
    });

    const agentType = routeDecision.route_to;
    conversation.agentType = agentType;
    conversation.routeDecision = {
      confidence: routeDecision.confidence,
      source: routeDecision.source,
      reason: routeDecision.reason,
    };

    if (context) {
      conversation.context = {
        type: agentType,
        folderId: context.folderId,
        fileId: context.fileId,
      };
    }

    // Task Planning
    let activePlan: TaskPlan | undefined = conversation.activePlan
      ? this.toPlainPlan(conversation.activePlan)
      : undefined;

    // 只在新会话或无活跃计划时触发任务分解
    if (!activePlan || activePlan.isComplete) {
      const contextInfo = context?.fileId
        ? `Environment: Document Editor. The user is currently viewing/editing a specific file.\ncurrentFileId: ${context.fileId}\nThe "document" agent should edit THIS file only. Do NOT plan steps to create new files for writing tasks.`
        : context?.folderId
          ? `Environment: Drive Browser. The user is currently browsing a specific folder in their drive.\ncurrentFolderId: ${context.folderId}\nThe "drive" agent should operate within this folder context. When the task requires gathering information from the drive and then editing a document, plan steps to first collect drive information, then navigate to and edit the target document. File operations like create, move, rename should default to this folder unless specified otherwise.`
          : `Environment: Drive Browser. No specific file or folder selected. The user is at the root of their drive.`;

      const planNeeded = await shouldPlanTask(message, contextInfo);

      if (planNeeded) {
        const plan = await generateTaskPlan(message, contextInfo);
        if (plan) {
          activePlan = plan;
          logger.info(
            { goal: plan.goal, steps: plan.steps.length },
            "Task plan created for request",
          );

          onEvent?.({
            type: AGENT_EVENT_TYPE.TASK_PLAN,
            data: { plan },
          });
        }
      }
    }

    // 发送 Event 给 SSE Stream
    onEvent?.({
      type: AGENT_EVENT_TYPE.ROUTE_DECISION,
      data: {
        agentType,
        confidence: routeDecision.confidence,
        source: routeDecision.source,
        reason: routeDecision.reason,
      },
    });

    // Agent Context
    const agentContext: AgentContext = {
      type: agentType,
      userId,
      folderId: context?.folderId || conversation.context?.folderId,
      fileId: context?.fileId || conversation.context?.fileId,
    };

    const userMessage: IMessage = {
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    conversation.messages.push(userMessage);

    const existingSummaries = (conversation.summaries || []).map((s) => ({
      summary: s.summary,
      messageRange: s.messageRange,
      createdAt: s.createdAt,
    }));

    logger.info(
      {
        agentType,
        userId,
        conversationId: conversation._id?.toString(),
        routeSource: routeDecision.source,
        routeConfidence: routeDecision.confidence,
        hasPlan: !!activePlan,
        useOrchestrator:
          activePlan &&
          !activePlan.isComplete &&
          this.orchestrator.needsOrchestration(activePlan),
      },
      "Running agent",
    );

    let responseContent: string;
    let toolCalls: IToolCall[] = [];
    let updatedSummaries = existingSummaries;
    let didUseOrchestrator = false;

    if (
      activePlan &&
      !activePlan.isComplete &&
      this.orchestrator.needsOrchestration(activePlan)
    ) {
      didUseOrchestrator = true;
      const orchResult = await this.orchestrator.executePlan(
        activePlan,
        agentContext,
        conversation.messages,
        conversation._id?.toString() || "new",
        existingSummaries,
        onEvent,
        signal,
      );

      activePlan = orchResult.plan;
      responseContent = orchResult.content;
      toolCalls = orchResult.toolCalls;
      updatedSummaries = orchResult.updatedSummaries;
    } else {
      if (activePlan && !activePlan.isComplete) {
        activePlan = this.taskTracker.startCurrentStep(activePlan);
      }

      const agent = this.selectAgent(agentType);

      const result = await agent.run(
        agentContext,
        conversation.messages,
        conversation._id?.toString() || "new",
        {
          existingSummaries,
          activePlan,
          onEvent,
          signal,
        },
      );

      if (activePlan && !activePlan.isComplete) {
        const hasErrors = result.toolCalls.some((tc) => tc.isError);
        if (hasErrors) {
          activePlan = this.taskTracker.failCurrentStep(
            activePlan,
            result.toolCalls
              .filter((tc) => tc.isError)
              .map((tc) => tc.result || "Unknown error")
              .join("; "),
          );
        } else {
          activePlan = this.taskTracker.completeCurrentStep(
            activePlan,
            result.content.slice(0, 200),
          );
        }
      }

      responseContent = result.content;
      toolCalls = result.toolCalls;
      updatedSummaries = result.updatedSummaries;
    }

    // 如果有活跃的任务计划，附加进度信息
    // 仅在非 Orchestrator 模式下追加（Orchestrator 的 buildFinalResponse 已包含进度）
    if (activePlan && activePlan.steps.length > 1 && !didUseOrchestrator) {
      const progress = this.taskTracker.getProgressSummary(activePlan);
      responseContent += `\n\n---\n${progress}`;
    }

    const assistantMessage: IMessage = {
      role: "assistant",
      content: responseContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      timestamp: new Date(),
    };
    conversation.messages.push(assistantMessage);

    // 持久化摘要和计划
    conversation.summaries = updatedSummaries.map((s) => ({
      summary: s.summary,
      messageRange: s.messageRange,
      createdAt: s.createdAt,
    }));
    conversation.activePlan = activePlan
      ? {
          goal: activePlan.goal,
          steps: activePlan.steps,
          currentStep: activePlan.currentStep,
          isComplete: activePlan.isComplete,
          summary: activePlan.summary,
        }
      : undefined;

    await conversation.save();

    const response: AgentChatResponse = {
      conversationId: conversation._id.toString(),
      agentType,
      message: assistantMessage,
      routeDecision: {
        confidence: routeDecision.confidence,
        source: routeDecision.source,
        reason: routeDecision.reason,
      },
    };

    if (activePlan) {
      response.taskPlan = activePlan;
    }

    return response;
  }

  // 不再直接执行工具 — 工具执行由 Agent 循环中的 waitForApproval 负责。
  async resolveApproval(
    userId: string,
    approvalId: string,
    approved: boolean,
    modifiedArgs?: Record<string, unknown>,
  ): Promise<ApprovalResponse> {
    const result = await this.gateway.resolveApproval(
      approvalId,
      userId,
      approved,
      modifiedArgs,
    );

    if (!result) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        "Approval request not found or already resolved",
      );
    }

    if (result.status === "expired") {
      return {
        success: false,
        message: "Approval request has expired. Please retry the operation.",
      };
    }

    if (result.status === "rejected") {
      return {
        success: true,
        message: `Operation '${result.toolName}' was rejected.`,
      };
    }

    if (result.status === "approved") {
      logger.info(
        {
          approvalId,
          toolName: result.toolName,
          hasModifiedArgs: !!modifiedArgs,
        },
        "Approval resolved — agent loop will execute the tool",
      );

      return {
        success: true,
        message: `Operation '${result.toolName}' approved. Executing...`,
      };
    }

    return { success: false, message: "Unexpected approval state" };
  }

  async getPendingApprovals(userId: string): Promise<ApprovalRequest[]> {
    return this.gateway.getPendingApprovals(userId);
  }

  async listConversations(userId: string): Promise<ConversationListItem[]> {
    const conversations = await Conversation.find({ userId, isActive: true })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    return conversations.map((c) => {
      const lastMsg = c.messages[c.messages.length - 1];
      return {
        id: c._id.toString(),
        title: c.title,
        agentType: ((c as any).agentType as AgentType) || "drive",
        lastMessage: lastMsg ? lastMsg.content.slice(0, 100) : "",
        messageCount: c.messages.length,
        updatedAt: c.updatedAt,
      };
    });
  }

  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<IConversation> {
    return this.getConversationOrThrow(conversationId, userId);
  }

  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.getConversationOrThrow(
      conversationId,
      userId,
    );
    conversation.isActive = false;
    await conversation.save();
  }

  private selectAgent(type: AgentType): BaseAgent {
    switch (type) {
      case "document":
        return this.documentAgent;
      case "search":
        return this.searchAgent;
      case "drive":
      default:
        return this.driveAgent;
    }
  }

  private async getConversationOrThrow(
    conversationId: string,
    userId: string,
  ): Promise<IConversation> {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId,
      isActive: true,
    });
    if (!conversation) {
      throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
    }
    return conversation;
  }

  // 将聊天请求放入 BullMQ 队列异步执行。
  // 返回 taskId，前端可通过 SSE / polling 获取进度。
  async chatAsync(
    userId: string,
    request: AgentChatRequest,
  ): Promise<{ taskId: string }> {
    const taskId = `agent-${userId}-${Date.now()}`;
    const data: AgentTaskData = {
      taskId,
      userId,
      message: request.message,
      conversationId: request.conversationId,
      context: request.context,
    };
    await enqueueAgentTask(data);
    return { taskId };
  }

  async getTaskStatus(taskId: string): Promise<AgentTaskStatusResponse> {
    return getAgentTaskStatus(taskId);
  }

  // 创建 BullMQ Worker 所需的 processor 回调。
  buildTaskProcessor() {
    return async (
      data: AgentTaskData,
      onEvent: (event: AgentStreamEvent) => void,
    ): Promise<AgentTaskResult> => {
      const request: AgentChatRequest = {
        message: data.message,
        conversationId: data.conversationId,
        context: data.context,
      };

      const result = await this.chat(data.userId, request, onEvent);

      return {
        taskId: data.taskId,
        conversationId: result.conversationId,
        agentType: result.agentType,
        content: result.message.content,
        success: true,
      };
    };
  }
}
