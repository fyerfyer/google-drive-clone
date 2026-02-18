import { Request, Response, NextFunction } from "express";
import { AgentService } from "../services/agent.service";
import { ResponseHelper } from "../utils/response.util";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { config } from "../config/env";
import { extractParam } from "../utils/request.util";

export class AgentController {
  constructor(private agentService: AgentService) {}

  async chat(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!._id.toString();
    const { message, conversationId } = req.body;

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

    const result = await this.agentService.chat(
      userId,
      message.trim(),
      conversationId,
    );

    return ResponseHelper.ok(res, result);
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
    });
  }
}
