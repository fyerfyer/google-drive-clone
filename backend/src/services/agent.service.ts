/**
 * Agent Service — Multi-Agent Orchestrator
 *
 * Routes requests to specialized agents (Drive Agent / Document Agent)
 * based on user context and intent. Manages conversations, approval flow,
 * and WebSocket integration.
 *
 * Architecture:
 *   User Message → Router → Context Enrichment → Agent Loop → Gateway → Response
 *                                                   ↑
 *                                          Capability Gateway
 *                                        (ACL + Risk + Approval)
 */

import Conversation, {
  IConversation,
  IMessage,
} from "../models/Conversation.model";
import { McpClientService } from "./mcp-client.service";
import { DriveAgent } from "./agent/drive-agent";
import { DocumentAgent } from "./agent/document-agent";
import { CapabilityGateway } from "./agent/capability-gateway";
import { routeToAgent } from "./agent/agent-router";
import { AgentType, AgentContext, ApprovalRequest } from "./agent/agent.types";
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

export interface ConversationSummary {
  id: string;
  title: string;
  agentType: AgentType;
  lastMessage: string;
  messageCount: number;
  updatedAt: Date;
}

// Multi Agent 调度
export class AgentService {
  private driveAgent: DriveAgent;
  private documentAgent: DocumentAgent;
  private gateway: CapabilityGateway;

  constructor(private mcpClient: McpClientService) {
    this.gateway = new CapabilityGateway();
    this.driveAgent = new DriveAgent(mcpClient, this.gateway);
    this.documentAgent = new DocumentAgent(mcpClient, this.gateway);
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
      });
    }

    // 路由到所需的 Agent
    const agentType = routeToAgent({
      explicitType: context?.type,
      conversationAgentType: (conversation as any).agentType,
      message,
    });

    conversation.agentType = agentType;
    if (context) {
      conversation.context = {
        type: agentType,
        folderId: context.folderId,
        fileId: context.fileId,
      };
    }

    // 构建 Agent 上下文
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

    const agent = this.selectAgent(agentType);

    logger.info(
      {
        agentType,
        userId,
        conversationId: conversation._id?.toString(),
        hasFolder: !!agentContext.folderId,
        hasFile: !!agentContext.fileId,
      },
      "Running agent",
    );

    const result = await agent.run(
      agentContext,
      conversation.messages,
      conversation._id?.toString() || "new",
    );

    const assistantMessage: IMessage = {
      role: "assistant",
      content: result.content,
      toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
      timestamp: new Date(),
    };
    conversation.messages.push(assistantMessage);

    await conversation.save();

    const response: AgentChatResponse = {
      conversationId: conversation._id.toString(),
      agentType,
      message: assistantMessage,
    };

    // 如果有待确认操作，附加到响应中
    if (result.pendingApprovals.length > 0) {
      response.pendingApprovals = result.pendingApprovals.map((a) => ({
        approvalId: a.approvalId,
        toolName: a.toolName,
        reason: a.reason,
      }));

      // Emit approval requests via WebSocket
      this.emitApprovalRequests(userId, result.pendingApprovals);
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

    // 执行操作
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
          result: {
            toolName: result.toolName,
            output,
            isError,
          },
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
          result: {
            toolName: result.toolName,
            output: errMsg,
            isError: true,
          },
          message: `Operation failed: ${errMsg}`,
        };
      }
    }

    return { success: false, message: "Unexpected approval state" };
  }

  getPendingApprovals(userId: string): ApprovalRequest[] {
    return this.gateway.getPendingApprovals(userId);
  }

  async listConversations(userId: string): Promise<ConversationSummary[]> {
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

  // 使用 WebSocket 向用户发送确认请求
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
      const { getSocket } = require("../lib/socket");
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
