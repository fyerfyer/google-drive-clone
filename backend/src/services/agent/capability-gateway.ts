/**
 * 能力执行 gateway
 *
 * 对代理工具调用实施三层安全措施：
 *   1. ACL — 按代理类型（drive 与 document）限制可用工具
 *   2. 操作风险 — 将工具分类为安全 / 中等 / 危险
 *   3. 人工审批 — 危险操作需要用户明确批准
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
  APPROVAL_TTL_SECONDS,
} from "./agent.types";

const pendingApprovals = new Map<string, ApprovalRequest>();

// 清理过期确认请求
setInterval(() => {
  const now = Date.now();
  for (const [id, req] of pendingApprovals) {
    if (
      req.status === "pending" &&
      now - req.createdAt.getTime() > req.ttlSeconds * 1000
    ) {
      req.status = "expired";
      req.resolvedAt = new Date();
      pendingApprovals.delete(id);
      logger.debug({ approvalId: id }, "Approval request expired");
    }
  }
}, 60_000);

interface RateWindow {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateWindow>();
const RATE_WINDOW_MS = 60_000; // 1 minute
const MAX_OPS_PER_WINDOW = 50; // max 50 tool calls

export class CapabilityGateway {
  checkToolPermission(
    agentType: AgentType,
    toolName: string,
    userId: string,
    conversationId: string,
    args: Record<string, unknown>,
  ): GatewayDecision {
    // ACL
    const allowedTools =
      agentType === "drive" ? DRIVE_AGENT_TOOLS : DOCUMENT_AGENT_TOOLS;

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
            : "Document editing operations should be performed in the Document editor."
        }`,
      };
    }

    // Rate limiting
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
      status: "pending",
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
  ): ApprovalRequest | null {
    const request = pendingApprovals.get(approvalId);
    if (!request) return null;
    if (request.userId !== userId) return null;
    if (request.status !== "pending") return null;

    const elapsed = Date.now() - request.createdAt.getTime();
    if (elapsed > request.ttlSeconds * 1000) {
      request.status = "expired";
      request.resolvedAt = new Date();
      pendingApprovals.delete(approvalId);
      return request;
    }

    request.status = approved ? "approved" : "rejected";
    request.resolvedAt = new Date();

    if (approved) {
      this.incrementRateCounter(userId);
    }

    logger.info(
      { approvalId, approved, toolName: request.toolName },
      "Approval request resolved",
    );

    return request;
  }

  getApproval(approvalId: string): ApprovalRequest | null {
    return pendingApprovals.get(approvalId) || null;
  }

  getPendingApprovals(userId: string): ApprovalRequest[] {
    const results: ApprovalRequest[] = [];
    for (const req of pendingApprovals.values()) {
      if (req.userId === userId && req.status === "pending") {
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
