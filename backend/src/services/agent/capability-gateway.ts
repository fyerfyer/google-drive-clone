/**
 * 能力执行 gateway
 *
 * 对代理工具调用实施三层安全措施：
 *   1. ACL — 按 Agent 类型限制可用工具
 *   2. 操作风险 — 将工具分类为安全 / 中等 / 危险
 *   3. 人工审批 — 危险操作需要用户明确批准
 *
 * 审批流程：
 *   Agent 循环中遇到危险操作 -> 创建 ApprovalRequest -> emit SSE 事件
 *   -> 调用 waitForApproval() 阻塞当前 SSE 流
 *   -> 用户通过 REST API 调用 resolveApproval() -> 触发 Promise 解析
 *   -> Agent 循环继续执行实际工具调用或跳过
 */

import { randomUUID } from "node:crypto";
import { logger } from "../../lib/logger";
import {
  AgentType,
  ApprovalRequest,
  GatewayDecision,
  OperationRisk,
  OPERATION_RISK,
  DRIVE_AGENT_TOOLS,
  DOCUMENT_AGENT_TOOLS,
  SEARCH_AGENT_TOOLS,
  APPROVAL_TTL_SECONDS,
  APPROVAL_STATUS,
} from "./agent.types";

const pendingApprovals = new Map<string, ApprovalRequest>();

export interface ApprovalResolution {
  approved: boolean;
  modifiedArgs?: Record<string, unknown>;
}

// 等待审批响应的 Promise 解析器。
// 当 resolveApproval 被调用时触发对应的 resolve，
// 使 waitForApproval 的 await 结束。
const approvalResolvers = new Map<
  string,
  { resolve: (result: ApprovalResolution) => void }
>();

// 清理过期确认请求（同时清理对应的 resolver）
setInterval(() => {
  const now = Date.now();
  for (const [id, req] of pendingApprovals) {
    if (
      req.status === APPROVAL_STATUS.PENDING &&
      now - req.createdAt.getTime() > req.ttlSeconds * 1000
    ) {
      req.status = APPROVAL_STATUS.EXPIRED;
      req.resolvedAt = new Date();
      pendingApprovals.delete(id);

      // 清理 resolver
      // 以超时拒绝方式解析
      const resolver = approvalResolvers.get(id);
      if (resolver) {
        resolver.resolve({ approved: false });
        approvalResolvers.delete(id);
      }

      logger.debug({ approvalId: id }, "Approval request expired");
    }
  }
}, 60_000);

interface RateWindow {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateWindow>();
const RATE_WINDOW_MS = 60_000; // 1 min
const MAX_OPS_PER_WINDOW = 50;

export class CapabilityGateway {
  checkToolPermission(
    agentType: AgentType,
    toolName: string,
    userId: string,
    conversationId: string,
    args: Record<string, unknown>,
  ): GatewayDecision {
    // ACL
    const toolSets: Record<AgentType, Set<string>> = {
      drive: DRIVE_AGENT_TOOLS,
      document: DOCUMENT_AGENT_TOOLS,
      search: SEARCH_AGENT_TOOLS,
    };
    const allowedTools = toolSets[agentType] || DRIVE_AGENT_TOOLS;

    if (!allowedTools.has(toolName)) {
      logger.warn(
        { agentType, toolName, userId },
        "Tool not permitted for this agent type",
      );
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Tool '${toolName}' is not available for the ${agentType} agent. ${
          agentType === "document"
            ? "File/folder management operations should be performed in the Drive workspace."
            : agentType === "search"
              ? "File modification operations should be performed by the Drive Agent or Document Agent."
              : "Document editing operations should be performed in the Document editor."
        }`,
      };
    }

    // Rate limit
    if (!this.checkRateLimit(userId)) {
      return {
        allowed: false,
        requiresApproval: false,
        reason:
          "Rate limit exceeded. Too many operations in a short time. Please wait a moment.",
      };
    }

    // Risk assessment
    const risk = this.getOperationRisk(toolName);

    if (risk === "dangerous") {
      const approval = this.createApprovalRequest(
        userId,
        conversationId,
        toolName,
        args,
        risk,
      );

      return {
        allowed: false,
        requiresApproval: true,
        reason: this.getDangerousOperationReason(toolName, args),
        approvalId: approval.id,
      };
    }

    this.incrementRateCounter(userId);
    return { allowed: true, requiresApproval: false };
  }

  private createApprovalRequest(
    userId: string,
    conversationId: string,
    toolName: string,
    args: Record<string, unknown>,
    risk: OperationRisk,
  ): ApprovalRequest {
    const id = randomUUID();
    const request: ApprovalRequest = {
      id,
      userId,
      conversationId,
      toolName,
      args,
      risk,
      reason: this.getDangerousOperationReason(toolName, args),
      status: APPROVAL_STATUS.PENDING,
      createdAt: new Date(),
      ttlSeconds: APPROVAL_TTL_SECONDS,
    };

    pendingApprovals.set(id, request);
    logger.info(
      { approvalId: id, toolName, userId },
      "Created approval request for dangerous operation",
    );

    return request;
  }

  resolveApproval(
    approvalId: string,
    userId: string,
    approved: boolean,
    modifiedArgs?: Record<string, unknown>,
  ): ApprovalRequest | null {
    const request = pendingApprovals.get(approvalId);
    if (!request) return null;
    if (request.userId !== userId) return null;
    if (request.status !== APPROVAL_STATUS.PENDING) return null;

    const elapsed = Date.now() - request.createdAt.getTime();
    if (elapsed > request.ttlSeconds * 1000) {
      request.status = APPROVAL_STATUS.EXPIRED;
      request.resolvedAt = new Date();
      pendingApprovals.delete(approvalId);

      // 同时通知等待中的 agent loop
      const resolver = approvalResolvers.get(approvalId);
      if (resolver) {
        resolver.resolve({ approved: false });
        approvalResolvers.delete(approvalId);
      }

      return request;
    }

    request.status = approved ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.REJECTED;
    request.resolvedAt = new Date();

    if (approved) {
      this.incrementRateCounter(userId);
    }

    // 触发等待中的 Agent 循环继续执行
    const resolver = approvalResolvers.get(approvalId);
    if (resolver) {
      resolver.resolve({ approved, modifiedArgs });
      approvalResolvers.delete(approvalId);
    }

    logger.info(
      {
        approvalId,
        approved,
        toolName: request.toolName,
        hasModifiedArgs: !!modifiedArgs,
      },
      "Approval request resolved",
    );

    return request;
  }

  async waitForApproval(
    approvalId: string,
    signal?: AbortSignal,
  ): Promise<ApprovalResolution> {
    return new Promise<ApprovalResolution>((resolve) => {
      // 已经被终止（SSE 断开）
      if (signal?.aborted) {
        resolve({ approved: false });
        return;
      }

      // 监听 SSE 连接断开
      const onAbort = () => {
        approvalResolvers.delete(approvalId);
        resolve({ approved: false });
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      // 注册 resolver — resolveApproval 调用时触发
      approvalResolvers.set(approvalId, {
        resolve: (result) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(result);
        },
      });

      // 超时保护（与 APPROVAL_TTL_SECONDS 对齐）
      setTimeout(() => {
        if (approvalResolvers.has(approvalId)) {
          approvalResolvers.delete(approvalId);
          signal?.removeEventListener("abort", onAbort);
          resolve({ approved: false });
          logger.debug({ approvalId }, "waitForApproval timed out");
        }
      }, APPROVAL_TTL_SECONDS * 1000);
    });
  }

  getApproval(approvalId: string): ApprovalRequest | null {
    return pendingApprovals.get(approvalId) || null;
  }

  getPendingApprovals(userId: string): ApprovalRequest[] {
    const results: ApprovalRequest[] = [];
    for (const req of pendingApprovals.values()) {
      if (req.userId === userId && req.status === APPROVAL_STATUS.PENDING) {
        results.push(req);
      }
    }
    return results;
  }

  consumeApproval(approvalId: string): ApprovalRequest | null {
    const req = pendingApprovals.get(approvalId);
    if (req) {
      pendingApprovals.delete(approvalId);
    }
    return req || null;
  }

  private getOperationRisk(toolName: string): OperationRisk {
    return OPERATION_RISK[toolName] || "moderate";
  }

  private getDangerousOperationReason(
    toolName: string,
    args: Record<string, unknown>,
  ): string {
    const descriptions: Record<string, string> = {
      write_file: `Overwrite the entire content of file${args.fileId ? ` (${args.fileId})` : ""}. This will replace all existing content.`,
      patch_file: `Modify content of file${args.fileId ? ` (${args.fileId})` : ""}. This will apply patch operations to the document.`,
      delete_file: `Permanently delete file${args.fileId ? ` (${args.fileId})` : ""}. This cannot be undone.`,
      delete_folder: `Permanently delete folder${args.folderId ? ` (${args.folderId})` : ""} and ALL its contents. This cannot be undone.`,
      trash_file: `Move file${args.fileId ? ` (${args.fileId})` : ""} to trash.`,
      trash_folder: `Move folder${args.folderId ? ` (${args.folderId})` : ""} and all its contents to trash.`,
      revoke_share_link: `Revoke share link${args.linkId ? ` (${args.linkId})` : ""}. Recipients will lose access.`,
      share_with_users: `Share resource with ${Array.isArray(args.emails) ? args.emails.join(", ") : "users"} as ${args.role || "viewer"}.`,
    };

    return descriptions[toolName] || `Execute dangerous operation: ${toolName}`;
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const window = rateLimits.get(userId);

    if (!window || now - window.windowStart > RATE_WINDOW_MS) {
      return true;
    }

    return window.count < MAX_OPS_PER_WINDOW;
  }

  private incrementRateCounter(userId: string): void {
    const now = Date.now();
    const window = rateLimits.get(userId);

    if (!window || now - window.windowStart > RATE_WINDOW_MS) {
      rateLimits.set(userId, { count: 1, windowStart: now });
    } else {
      window.count++;
    }
  }
}
