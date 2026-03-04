/**
 * 临时上下文存储系统，用于暂存并发执行后的大量结果。
 *
 * 特性：
 *   - 纯内存存储，与会话 Session 生命周期绑定
 *   - 支持分块 + 摘要的 Map-Reduce 消费模式
 *
 * 使用场景：
 *   - TaskOrchestrator 检测到并发只读步骤结果过大
 *   - 将庞大数据包写入此存储，生成 Reference ID
 *   - 后续 Reduce 步骤通过专用工具消费数据
 */

import { logger } from "../../lib/logger";
import { v4 as uuidv4 } from "uuid";

export const EPHEMERAL_TTL_MS = 10 * 60 * 1000; // 10 min
export const CONTEXT_OFFLOAD_THRESHOLD_CHARS = 50_000; // ~12.5K tokens
export const MAP_REDUCE_CHUNK_SIZE = 8_000;
export const FILE_EXTRACTION_CONCURRENCY = 10;
export const MAP_REDUCE_LLM_CONCURRENCY = 8;

export interface EphemeralEntry {
  id: string;
  // 原始数据
  data: string;
  items?: EphemeralItem[];
  metadata: {
    sourceType: "batch_results" | "file_contents" | "search_results";
    itemCount: number;
    totalChars: number;
    description: string;
    createdAt: number;
  };
  expiresAt: number;
}

export interface EphemeralItem {
  label: string;
  content: string;
  meta?: Record<string, unknown>;
}

const store = new Map<string, EphemeralEntry>();

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(
        { cleaned, remaining: store.size },
        "Ephemeral store cleanup",
      );
    }
    if (store.size === 0 && cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }, 60_000); // 1 min
}

export function storeEphemeral(
  data: string,
  items: EphemeralItem[] | undefined,
  metadata: Omit<EphemeralEntry["metadata"], "createdAt">,
  ttlMs: number = EPHEMERAL_TTL_MS,
): string {
  const id = `eph_${uuidv4().slice(0, 12)}`;
  const now = Date.now();

  const entry: EphemeralEntry = {
    id,
    data,
    items,
    metadata: {
      ...metadata,
      createdAt: now,
    },
    expiresAt: now + ttlMs,
  };

  store.set(id, entry);
  ensureCleanup();

  logger.info(
    {
      ephemeralId: id,
      totalChars: metadata.totalChars,
      itemCount: metadata.itemCount,
      sourceType: metadata.sourceType,
    },
    "Stored data in ephemeral context",
  );

  return id;
}

export function getEphemeral(id: string): EphemeralEntry | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(id);
    return null;
  }
  return entry;
}

export function queryEphemeralByLabel(
  id: string,
  labelQuery: string,
): EphemeralItem[] {
  const entry = getEphemeral(id);
  if (!entry || !entry.items) return [];

  const queryLower = labelQuery.toLowerCase();
  return entry.items.filter((item) =>
    item.label.toLowerCase().includes(queryLower),
  );
}

export function getEphemeralChunks(
  id: string,
  chunkSize: number = MAP_REDUCE_CHUNK_SIZE,
): string[] {
  const entry = getEphemeral(id);
  if (!entry) return [];

  // 如果有结构化数据，按结构化数据分块
  if (entry.items && entry.items.length > 0) {
    const chunks: string[] = [];
    let currentChunk = "";

    for (const item of entry.items) {
      const itemText = `### ${item.label}\n${item.content}\n\n`;
      if (
        currentChunk.length + itemText.length > chunkSize &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk);
        currentChunk = itemText;
      } else {
        currentChunk += itemText;
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }

  // 否则按字符边界分块
  // 在换行符处分割
  const data = entry.data;
  const chunks: string[] = [];
  let start = 0;

  while (start < data.length) {
    let end = Math.min(start + chunkSize, data.length);
    if (end < data.length) {
      const newlineIdx = data.lastIndexOf("\n", end);
      if (newlineIdx > start + chunkSize * 0.5) {
        end = newlineIdx + 1;
      }
    }
    chunks.push(data.slice(start, end));
    start = end;
  }

  return chunks;
}

export function deleteEphemeral(id: string): boolean {
  return store.delete(id);
}

export function getEphemeralMeta(
  id: string,
): EphemeralEntry["metadata"] | null {
  const entry = getEphemeral(id);
  if (!entry) return null;
  return entry.metadata;
}

export function getStoreSize(): number {
  return store.size;
}
