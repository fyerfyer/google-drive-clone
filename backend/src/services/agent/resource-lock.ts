/**
 * 使用 Redlock 算法对文件/文件夹资源加锁，防止多个 Agent 或多个用户
 * 并发操作同一资源导致数据不一致。
 *
 * 写操作（rename, delete, move, trash, share, patch_file, write_file 等）
 * 在执行前获取锁，执行后释放。
 */

import Redlock, { Lock } from "redlock";
import { redisClient } from "../../config/redis";
import { logger } from "../../lib/logger";

/* ───────────── Redlock 实例（单 Redis 节点模式） ──────────── */

const redlock = new Redlock([redisClient], {
  // 重试配置
  retryCount: 3,
  retryDelay: 200, // ms
  retryJitter: 100, // ms
  // 自动续期
  automaticExtensionThreshold: 500, // ms
});

redlock.on("error", (err: Error) => {
  // 大多数 Redlock 错误只是资源被占用，属于正常竞争
  if (err instanceof Error && err.message.includes("exceed")) {
    logger.debug({ err: err.message }, "Redlock: resource busy (expected)");
  } else {
    logger.warn({ err }, "Redlock error");
  }
});

const LOCK_PREFIX = "agent:lock:";
const DEFAULT_LOCK_TTL = 30_000;

export const WRITE_TOOLS = new Set([
  "rename_file",
  "move_file",
  "trash_file",
  "restore_file",
  "delete_file",
  "star_file",
  "write_file",
  "patch_file",
  "create_file",
  "rename_folder",
  "move_folder",
  "trash_folder",
  "restore_folder",
  "delete_folder",
  "star_folder",
  "create_folder",
  "revoke_share_link",
  "share_with_users",
  "create_share_link",
]);

// 从工具参数中提取资源 ID，用于构建 lock key。
// 返回一个或多个资源键（例如 move 操作涉及源和目标）。
export function getResourceKeys(
  toolName: string,
  args: Record<string, unknown>,
): string[] {
  const keys: string[] = [];

  if (args.fileId) {
    keys.push(`${LOCK_PREFIX}file:${args.fileId}`);
  }
  if (args.folderId) {
    keys.push(`${LOCK_PREFIX}folder:${args.folderId}`);
  }
  // move 操作的目标文件夹
  if (args.destinationFolderId) {
    keys.push(`${LOCK_PREFIX}folder:${args.destinationFolderId}`);
  }
  if (args.parentFolderId) {
    keys.push(`${LOCK_PREFIX}folder:${args.parentFolderId}`);
  }
  if (args.linkId) {
    keys.push(`${LOCK_PREFIX}link:${args.linkId}`);
  }

  // 如果没有提取到具体资源 ID，按工具名 + userId 做粗粒度锁
  if (keys.length === 0 && args.userId) {
    keys.push(`${LOCK_PREFIX}tool:${toolName}:${args.userId}`);
  }

  return keys;
}

export function needsLock(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName);
}

export async function acquireLock(
  resources: string[],
  ttl: number = DEFAULT_LOCK_TTL,
): Promise<Lock> {
  const lock = await redlock.acquire(resources, ttl);
  logger.debug({ resources, ttl }, "Acquired distributed lock");
  return lock;
}

export async function releaseLock(lock: Lock): Promise<void> {
  try {
    await lock.release();
    logger.debug("Released distributed lock");
  } catch (err) {
    // Lock 可能已自动过期，忽略
    logger.debug({ err }, "Lock release failed (may have already expired)");
  }
}

export async function withLock<T>(
  resources: string[],
  fn: () => Promise<T>,
  ttl: number = DEFAULT_LOCK_TTL,
): Promise<T> {
  const lock = await acquireLock(resources, ttl);
  try {
    return await fn();
  } finally {
    await releaseLock(lock);
  }
}
