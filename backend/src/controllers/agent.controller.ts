import { Request, Response, NextFunction } from "express";
import { AgentService, AgentChatRequest } from "../services/agent.service";
import { ResponseHelper } from "../utils/response.util";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { config } from "../config/env";
import { extractParam } from "../utils/request.util";
import { AgentType } from "../services/agent/agent.types";

export class AgentController {
  constructor(private agentService: AgentService) {}

  async chat(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!._id.toString();
    const { message, conversationId, context } = req.body;

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Message is required");
    }

    if (message.length > 4000) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Message too long (max 4000 characters)",
      );
    }

    let validatedContext: AgentChatRequest["context"];
    if (context) {
      if (
        context.type &&
        context.type !== "drive" &&
        context.type !== "document"
      ) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Invalid context type. Must be 'drive' or 'document'.",
        );
      }
      validatedContext = {
        type: context.type as AgentType | undefined,
        folderId: context.folderId as string | undefined,
        fileId: context.fileId as string | undefined,
      };
    }

    const chatRequest: AgentChatRequest = {
      message: message.trim(),
      conversationId,
      context: validatedContext,
    };

    const result = await this.agentService.chat(userId, chatRequest);

    return ResponseHelper.ok(res, result);
  }

  async resolveApproval(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!._id.toString();
    const approvalId = extractParam(req.params.approvalId);
    const { approved } = req.body;

    if (typeof approved !== "boolean") {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "'approved' field (boolean) is required",
      );
    }

    const result = await this.agentService.resolveApproval(
      userId,
      approvalId,
      approved,
    );

    return ResponseHelper.ok(res, result);
  }

  async getPendingApprovals(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!._id.toString();
    const approvals = this.agentService.getPendingApprovals(userId);

    return ResponseHelper.ok(res, {
      approvals: approvals.map((a) => ({
        id: a.id,
        toolName: a.toolName,
        args: a.args,
        reason: a.reason,
        status: a.status,
        createdAt: a.createdAt,
      })),
    });
  }

  async listConversations(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!._id.toString();
    const conversations = await this.agentService.listConversations(userId);
    return ResponseHelper.ok(res, { conversations });
  }

  async getConversation(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!._id.toString();
    const conversationId = extractParam(req.params.conversationId);
    const conversation = await this.agentService.getConversation(
      conversationId,
      userId,
    );

    return ResponseHelper.ok(res, {
      id: conversation._id.toString(),
      title: conversation.title,
      agentType: (conversation as any).agentType || "drive",
      context: (conversation as any).context || {},
      messages: conversation.messages,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    });
  }

  async deleteConversation(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!._id.toString();
    const conversationId = extractParam(req.params.conversationId);
    await this.agentService.deleteConversation(conversationId, userId);
    return ResponseHelper.message(res, "Conversation deleted");
  }

  async getStatus(req: Request, res: Response, next: NextFunction) {
    const isConfigured = !!config.llmApiKey;
    return ResponseHelper.ok(res, {
      enabled: isConfigured,
      model: config.llmModel,
      provider: config.llmBaseUrl,
      agents: ["drive", "document"],
      features: {
        multiAgent: true,
        capabilityGateway: true,
        documentPatching: true,
        humanApproval: true,
        realtimeEditing: true,
      },
    });
  }
}
