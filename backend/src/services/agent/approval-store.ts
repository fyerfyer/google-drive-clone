/**
 * 分布式 Approval Store
 *
 * 将审批请求存储在 Redis Hash 中
 * 使用 Redis Pub/Sub 在节点间广播审批 Approve 事件
 */

import { randomUUID } from "node:crypto";
import { redisClient, redisSubscriber } from "../../config/redis";
import { logger } from "../../lib/logger";
import {
  ApprovalRequest,
  APPROVAL_TTL_SECONDS,
  APPROVAL_STATUS,
} from "./agent.types";

const APPROVAL_KEY_PREFIX = "agent:approval:";
const APPROVAL_CHANNEL = "agent:approval:resolved";

export interface ApprovalResolution {
  approved: boolean;
  modifiedArgs?: Record<string, unknown>;
}

// 本地进程内存中保留每个审批 ID 对应的 Promise resolver。
// 只有创建审批的那个进程才持有 resolver，因此 Pub/Sub 只需在本地
// 查找并触发即可。
const localResolvers = new Map<
  string,
  { resolve: (result: ApprovalResolution) => void }
>();

let subscribed = false;

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;

  redisSubscriber.subscribe(APPROVAL_CHANNEL).catch((err) => {
    logger.error({ err }, "Failed to subscribe to approval channel");
  });

  redisSubscriber.on("message", (channel, message) => {
    if (channel !== APPROVAL_CHANNEL) return;

    try {
      const data = JSON.parse(message) as {
        approvalId: string;
        approved: boolean;
        modifiedArgs?: Record<string, unknown>;
      };

      const resolver = localResolvers.get(data.approvalId);
      if (resolver) {
        resolver.resolve({
          approved: data.approved,
          modifiedArgs: data.modifiedArgs,
        });
        localResolvers.delete(data.approvalId);
        logger.debug(
          { approvalId: data.approvalId },
          "Local resolver triggered via Pub/Sub",
        );
      }
    } catch (err) {
      logger.warn({ err, message }, "Failed to parse approval Pub/Sub message");
    }
  });
}

// 将 ApprovalRequest 写入 Redis Hash，设置 TTL
export async function storeApproval(request: ApprovalRequest): Promise<void> {
  const key = APPROVAL_KEY_PREFIX + request.id;
  await redisClient.set(key, JSON.stringify(request), "EX", request.ttlSeconds);
  logger.info(
    {
      approvalId: request.id,
      toolName: request.toolName,
      userId: request.userId,
    },
    "Approval stored in Redis",
  );
}

// 从 Redis 获取单个 ApprovalRequest
export async function getApproval(
  approvalId: string,
): Promise<ApprovalRequest | null> {
  const raw = await redisClient.get(APPROVAL_KEY_PREFIX + approvalId);
  if (!raw) return null;
  return JSON.parse(raw) as ApprovalRequest;
}

// 获取某用户所有 pending 审批
// 通过 SCAN 遍历前缀匹配的 key。
export async function getPendingApprovals(
  userId: string,
): Promise<ApprovalRequest[]> {
  const results: ApprovalRequest[] = [];
  let cursor = "0";

  do {
    const [nextCursor, keys] = await redisClient.scan(
      cursor,
      "MATCH",
      APPROVAL_KEY_PREFIX + "*",
      "COUNT",
      100,
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      const values = await redisClient.mget(...keys);
      for (const raw of values) {
        if (!raw) continue;
        try {
          const req = JSON.parse(raw) as ApprovalRequest;
          if (req.userId === userId && req.status === APPROVAL_STATUS.PENDING) {
            results.push(req);
          }
        } catch {
          /* skip malformed */
        }
      }
    }
  } while (cursor !== "0");

  return results;
}

// Resolve 审批：更新 Redis 中的状态，然后通过 Pub/Sub 广播给所有节点
export async function resolveApproval(
  approvalId: string,
  userId: string,
  approved: boolean,
  modifiedArgs?: Record<string, unknown>,
): Promise<ApprovalRequest | null> {
  const key = APPROVAL_KEY_PREFIX + approvalId;
  const raw = await redisClient.get(key);
  if (!raw) return null;

  const request = JSON.parse(raw) as ApprovalRequest;
  if (request.userId !== userId) return null;
  if (request.status !== APPROVAL_STATUS.PENDING) return null;

  // 检查是否已过期
  const elapsed = Date.now() - new Date(request.createdAt).getTime();
  if (elapsed > request.ttlSeconds * 1000) {
    request.status = APPROVAL_STATUS.EXPIRED;
    request.resolvedAt = new Date();
    await redisClient.del(key);

    // 广播过期决议，让等待的 Agent 继续
    await redisClient.publish(
      APPROVAL_CHANNEL,
      JSON.stringify({ approvalId, approved: false }),
    );

    return request;
  }

  request.status = approved
    ? APPROVAL_STATUS.APPROVED
    : APPROVAL_STATUS.REJECTED;
  request.resolvedAt = new Date();

  // 更新 Redis（保留剩余 TTL 供查询；也可直接删除）
  const remainingTtl = Math.max(
    1,
    request.ttlSeconds - Math.floor(elapsed / 1000),
  );
  await redisClient.set(key, JSON.stringify(request), "EX", remainingTtl);

  // 通过 Pub/Sub 广播
  await redisClient.publish(
    APPROVAL_CHANNEL,
    JSON.stringify({ approvalId, approved, modifiedArgs }),
  );

  logger.info(
    {
      approvalId,
      approved,
      toolName: request.toolName,
      hasModifiedArgs: !!modifiedArgs,
    },
    "Approval resolved and broadcasted via Pub/Sub",
  );

  return request;
}

export async function consumeApproval(
  approvalId: string,
): Promise<ApprovalRequest | null> {
  const key = APPROVAL_KEY_PREFIX + approvalId;
  const raw = await redisClient.get(key);
  if (raw) {
    await redisClient.del(key);
    return JSON.parse(raw) as ApprovalRequest;
  }
  return null;
}

export function createApprovalId(): string {
  return randomUUID();
}

// 等待审批结果。注册本地 resolver 并启动 Pub/Sub 监听。
// 当对应的 Pub/Sub 消息到达（可能来自任何节点）时 resolve Promise。
export async function waitForApproval(
  approvalId: string,
  signal?: AbortSignal,
): Promise<ApprovalResolution> {
  ensureSubscribed();

  return new Promise<ApprovalResolution>((resolve) => {
    if (signal?.aborted) {
      resolve({ approved: false });
      return;
    }

    const onAbort = () => {
      localResolvers.delete(approvalId);
      resolve({ approved: false });
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    localResolvers.set(approvalId, {
      resolve: (result) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(result);
      },
    });

    // 超时兜底
    setTimeout(() => {
      if (localResolvers.has(approvalId)) {
        localResolvers.delete(approvalId);
        signal?.removeEventListener("abort", onAbort);
        resolve({ approved: false });
        logger.debug({ approvalId }, "waitForApproval timed out");
      }
    }, APPROVAL_TTL_SECONDS * 1000);
  });
}
