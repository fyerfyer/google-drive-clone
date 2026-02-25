import { Request, Response, NextFunction } from "express";
import { AgentService } from "../services/agent.service";
import { ResponseHelper } from "../utils/response.util";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { config } from "../config/env";
import { extractParam } from "../utils/request.util";
import {
  AgentType,
  AgentStreamEvent,
  AGENT_EVENT_TYPE,
  AGENT_TASK_STATUS,
} from "../services/agent/agent.types";
import { subscribeTaskEvents } from "../services/agent/agent-task-queue";

export class AgentController {
  constructor(private agentService: AgentService) {}

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
    const approvals = await this.agentService.getPendingApprovals(userId);

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
        asyncTaskQueue: true,
      },
    });
  }

  // 主聊天接口：将任务入队 BullMQ，前端通过 /tasks/:taskId/stream 接收 SSE 事件
  async chatAsync(req: Request, res: Response, next: NextFunction) {
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

    let validatedContext:
      | { type?: AgentType; folderId?: string; fileId?: string }
      | undefined;
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

    const result = await this.agentService.chatAsync(userId, {
      message: message.trim(),
      conversationId,
      context: validatedContext,
    });

    return ResponseHelper.ok(res, result);
  }

  // 查询异步任务状态
  async getTaskStatus(req: Request, res: Response, next: NextFunction) {
    const taskId = extractParam(req.params.taskId);
    const status = await this.agentService.getTaskStatus(taskId);
    return ResponseHelper.ok(res, status);
  }

  // 订阅异步任务的实时 SSE 事件流
  // 通过 Redis Pub/Sub 接收 Worker 广播
  async streamTaskEvents(req: Request, res: Response, next: NextFunction) {
    const taskId = extractParam(req.params.taskId);

    // 先检查任务是否存在
    const status = await this.agentService.getTaskStatus(taskId);
    if (status.status === AGENT_TASK_STATUS.NOT_FOUND) {
      throw new AppError(StatusCodes.NOT_FOUND, "Task not found");
    }

    // 始终使用 SSE 格式，确保前端接收格式一致
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // 如果任务已完成或失败，以 SSE 事件格式返回后关闭
    if (
      status.status === AGENT_TASK_STATUS.COMPLETED ||
      status.status === AGENT_TASK_STATUS.FAILED
    ) {
      const event: AgentStreamEvent =
        status.status === AGENT_TASK_STATUS.COMPLETED && status.result
          ? {
              type: AGENT_EVENT_TYPE.DONE,
              data: status.result as unknown as Record<string, unknown>,
            }
          : {
              type: AGENT_EVENT_TYPE.ERROR,
              data: { message: status.error || "Task failed" },
            };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.end();
      return;
    }

    const keepAliveInterval = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        // Client disconnected
      }
    }, 25_000);

    const sendEvent = (event: AgentStreamEvent) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Client disconnected
      }
    };

    // 订阅 Redis Pub/Sub 事件
    const unsubscribe = subscribeTaskEvents(taskId, (event) => {
      sendEvent(event);

      // 当收到 DONE 或 ERROR 时结束流
      if (
        event.type === AGENT_EVENT_TYPE.DONE ||
        event.type === AGENT_EVENT_TYPE.ERROR
      ) {
        cleanup();
      }
    });

    const cleanup = () => {
      clearInterval(keepAliveInterval);
      unsubscribe();
      res.end();
    };

    // 客户端断开时清理
    req.on("close", cleanup);
  }
}
