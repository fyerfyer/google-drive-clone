/**
 * 能力执行 gateway
 *
 * 对代理工具调用实施三层安全措施：
 *   1. ACL — 按 Agent 类型限制可用工具
 *   2. 操作风险 — 将工具分类为安全 / 中等 / 危险
 *   3. 人工审批 — 危险操作需要用户明确批准
 *
 * 审批流程：
 *   Agent 循环中遇到危险操作 -> 创建 ApprovalRequest 存入 Redis Hash
 *   -> emit SSE 事件 -> 调用 waitForApproval() 通过 Redis Pub/Sub 阻塞
 *   -> 用户通过 REST API 调用 resolveApproval() -> 发布 Pub/Sub 事件
 *   -> 节点捕获事件，触发 Promise.resolve() 继续执行
 */

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
import {
  ApprovalResolution,
  createApprovalId,
  storeApproval,
  getApproval as getApprovalFromStore,
  getPendingApprovals as getPendingApprovalsFromStore,
  resolveApproval as resolveApprovalInStore,
  consumeApproval as consumeApprovalFromStore,
  waitForApproval as waitForApprovalFromStore,
} from "./approval-store";

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
      const approval = this.createApprovalRequestSync(
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

  // 同步创建 ApprovalRequest 对象，并异步持久化到 Redis。
  // 返回值可立即用于 GatewayDecision，Redis 写入在后台完成。
  private createApprovalRequestSync(
    userId: string,
    conversationId: string,
    toolName: string,
    args: Record<string, unknown>,
    risk: OperationRisk,
  ): ApprovalRequest {
    const id = createApprovalId();
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

    // 异步写入 Redis（waitForApproval 会在自身注册 resolver 前等待）
    storeApproval(request).catch((err) => {
      logger.error(
        { err, approvalId: id },
        "Failed to store approval in Redis",
      );
    });

    logger.info(
      { approvalId: id, toolName, userId },
      "Created approval request for dangerous operation",
    );

    return request;
  }

  // 通过 REST API 解决审批请求。
  // 操作写入 Redis 并通过 Pub/Sub 广播给所有节点。
  async resolveApproval(
    approvalId: string,
    userId: string,
    approved: boolean,
    modifiedArgs?: Record<string, unknown>,
  ): Promise<ApprovalRequest | null> {
    const request = await resolveApprovalInStore(
      approvalId,
      userId,
      approved,
      modifiedArgs,
    );

    if (!request) return null;

    if (approved) {
      this.incrementRateCounter(userId);
    }

    return request;
  }

  async waitForApproval(
    approvalId: string,
    signal?: AbortSignal,
  ): Promise<ApprovalResolution> {
    return waitForApprovalFromStore(approvalId, signal);
  }

  async getApproval(approvalId: string): Promise<ApprovalRequest | null> {
    return getApprovalFromStore(approvalId);
  }

  async getPendingApprovals(userId: string): Promise<ApprovalRequest[]> {
    return getPendingApprovalsFromStore(userId);
  }

  async consumeApproval(approvalId: string): Promise<ApprovalRequest | null> {
    return consumeApprovalFromStore(approvalId);
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
