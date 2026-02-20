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
} from "./agent/agent.types";
import { BaseAgent } from "./agent/base-agent";
import { logger } from "../lib/logger";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { getSocket } from "../lib/socket";

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

  async chat(
    userId: string,
    request: AgentChatRequest,
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
        ? {
            goal: conversation.activePlan.goal,
            steps: conversation.activePlan.steps.map((s) => ({ ...s })),
            currentStep: conversation.activePlan.currentStep,
            isComplete: conversation.activePlan.isComplete,
            summary: conversation.activePlan.summary,
          }
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
      ? {
          goal: conversation.activePlan.goal,
          steps: conversation.activePlan.steps.map((s) => ({ ...s })),
          currentStep: conversation.activePlan.currentStep,
          isComplete: conversation.activePlan.isComplete,
          summary: conversation.activePlan.summary,
        }
      : undefined;

    // 只在新会话或无活跃计划时触发任务分解
    if (!activePlan || activePlan.isComplete) {
      const contextInfo = context?.folderId
        ? `Current folder: ${context.folderId}`
        : context?.fileId
          ? `Current file: ${context.fileId}`
          : undefined;

      const planNeeded = await shouldPlanTask(message, contextInfo);

      if (planNeeded) {
        const plan = await generateTaskPlan(message, contextInfo);
        if (plan) {
          activePlan = plan;
          logger.info(
            { goal: plan.goal, steps: plan.steps.length },
            "Task plan created for request",
          );
        }
      }
    }

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
    let pendingApprovals: Array<{
      approvalId: string;
      toolName: string;
      args: Record<string, unknown>;
      reason: string;
    }> = [];
    let updatedSummaries = existingSummaries;

    if (
      activePlan &&
      !activePlan.isComplete &&
      this.orchestrator.needsOrchestration(activePlan)
    ) {
      const orchResult = await this.orchestrator.executePlan(
        activePlan,
        agentContext,
        conversation.messages,
        conversation._id?.toString() || "new",
        existingSummaries,
      );

      activePlan = orchResult.plan;
      responseContent = orchResult.content;
      toolCalls = orchResult.toolCalls;
      pendingApprovals = orchResult.pendingApprovals;
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
      pendingApprovals = result.pendingApprovals;
      updatedSummaries = result.updatedSummaries;
    }

    // 如果有活跃的任务计划，附加进度信息
    if (activePlan && activePlan.steps.length > 1) {
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

    if (pendingApprovals.length > 0) {
      response.pendingApprovals = pendingApprovals.map((a) => ({
        approvalId: a.approvalId,
        toolName: a.toolName,
        reason: a.reason,
      }));
      this.emitApprovalRequests(userId, pendingApprovals);
    }

    return response;
  }

  async resolveApproval(
    userId: string,
    approvalId: string,
    approved: boolean,
  ): Promise<ApprovalResponse> {
    const result = this.gateway.resolveApproval(approvalId, userId, approved);

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
      this.gateway.consumeApproval(approvalId);
      return {
        success: true,
        message: `Operation '${result.toolName}' was rejected.`,
      };
    }

    if (result.status === "approved") {
      try {
        const toolResult = await this.mcpClient.callTool(result.toolName, {
          ...result.args,
          userId,
        });

        const output = toolResult.content.map((c) => c.text).join("\n");
        const isError = toolResult.isError || false;

        this.gateway.consumeApproval(approvalId);
        this.emitApprovalResolved(
          userId,
          approvalId,
          result.toolName,
          !isError,
        );

        return {
          success: true,
          result: { toolName: result.toolName, output, isError },
          message: isError
            ? `Operation '${result.toolName}' failed: ${output}`
            : `Operation '${result.toolName}' completed successfully.`,
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { error, approvalId, toolName: result.toolName },
          "Approved tool execution failed",
        );
        this.gateway.consumeApproval(approvalId);
        return {
          success: false,
          result: { toolName: result.toolName, output: errMsg, isError: true },
          message: `Operation failed: ${errMsg}`,
        };
      }
    }

    return { success: false, message: "Unexpected approval state" };
  }

  getPendingApprovals(userId: string): ApprovalRequest[] {
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

  private emitApprovalRequests(
    userId: string,
    approvals: Array<{
      approvalId: string;
      toolName: string;
      args: Record<string, unknown>;
      reason: string;
    }>,
  ): void {
    try {
      const io = getSocket();
      io.to(`user:${userId}`).emit("agent:approval_needed", {
        approvals: approvals.map((a) => ({
          approvalId: a.approvalId,
          toolName: a.toolName,
          reason: a.reason,
          args: a.args,
        })),
        timestamp: new Date().toISOString(),
      });
    } catch {
      // WebSocket may not be initialized
    }
  }

  private emitApprovalResolved(
    userId: string,
    approvalId: string,
    toolName: string,
    success: boolean,
  ): void {
    try {
      const io = getSocket();
      io.to(`user:${userId}`).emit("agent:approval_resolved", {
        approvalId,
        toolName,
        success,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // WebSocket may not be initialized
    }
  }
}
