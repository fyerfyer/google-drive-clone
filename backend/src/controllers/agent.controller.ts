import { Request, Response, NextFunction } from "express";
import { AgentService, AgentChatRequest } from "../services/agent.service";
import { ResponseHelper } from "../utils/response.util";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { config } from "../config/env";
import { extractParam } from "../utils/request.util";
import { AgentType, AgentStreamEvent, AGENT_EVENT_TYPE } from "../services/agent/agent.types";
import { logger } from "../lib/logger";

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
      const validTypes: AgentType[] = ["drive", "document", "search"];
      if (context.type && !validTypes.includes(context.type)) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Invalid context type. Must be one of: ${validTypes.join(", ")}.`,
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

  // SSE 流式处理接口
  async chatStream(req: Request, res: Response, next: NextFunction) {
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
      const validTypes: AgentType[] = ["drive", "document", "search"];
      if (context.type && !validTypes.includes(context.type)) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Invalid context type. Must be one of: ${validTypes.join(", ")}.`,
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

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // SSE 每25秒发送一次心跳包，防止代理/负载均衡器超时断开
    const keepAliveInterval = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        // Client disconnected
      }
    }, 25_000);

    // 向代理循环发出SSE断开信号
    const abortController = new AbortController();
    req.on("close", () => {
      abortController.abort();
    });

    const sendEvent = (event: AgentStreamEvent) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Client disconnected
      }
    };

    try {
      const result = await this.agentService.chat(
        userId,
        chatRequest,
        sendEvent,
        abortController.signal,
      );

      // 聊天完成，发送 done 事件
      sendEvent({
        type: AGENT_EVENT_TYPE.DONE,
        data: result as unknown as Record<string, unknown>,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error, userId }, "Agent streaming chat failed");
      sendEvent({ type: AGENT_EVENT_TYPE.ERROR, data: { message: errMsg } });
    } finally {
      clearInterval(keepAliveInterval);
      res.end();
    }
  }

  async resolveApproval(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!._id.toString();
    const approvalId = extractParam(req.params.approvalId);
    const { approved, modifiedArgs } = req.body;

    if (typeof approved !== "boolean") {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "'approved' field (boolean) is required",
      );
    }

    if (
      modifiedArgs !== undefined &&
      (typeof modifiedArgs !== "object" || modifiedArgs === null)
    ) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "'modifiedArgs' must be an object if provided",
      );
    }

    const result = await this.agentService.resolveApproval(
      userId,
      approvalId,
      approved,
      modifiedArgs,
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
      summaries: (conversation as any).summaries || [],
      activePlan: (conversation as any).activePlan || null,
      routeDecision: (conversation as any).routeDecision || null,
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
      agents: ["drive", "document", "search"],
      features: {
        multiAgent: true,
        hybridRouter: true,
        memoryManager: true,
        taskPlanning: true,
        capabilityGateway: true,
        documentPatching: true,
        humanApproval: true,
        realtimeEditing: true,
      },
    });
  }
}
