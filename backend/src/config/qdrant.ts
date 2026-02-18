import { config } from "./env";
import { logger } from "../lib/logger";

function getQdrantUrl(): string {
  return config.qdrantUrl;
}

function getQdrantApiKey(): string {
  return config.qdrantApiKey;
}

export function getVectorDim(): number {
  return config.embeddingDimension;
}

export const COLLECTION_NAME = "file_chunks";

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = getQdrantApiKey();
  if (apiKey) {
    h["api-key"] = apiKey;
  }
  return h;
}

async function qdrantFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${getQdrantUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string>) },
  });
  return res;
}

export async function ensureCollection(): Promise<void> {
  try {
    // 检查 collection 是否存在
    const check = await qdrantFetch(`/collections/${COLLECTION_NAME}`);
    if (check.ok) {
      logger.info(
        { collection: COLLECTION_NAME },
        "Qdrant collection already exists",
      );
      return;
    }

    // 创建 collection
    const dim = getVectorDim();
    const res = await qdrantFetch(`/collections/${COLLECTION_NAME}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: dim,
          distance: "Cosine",
        },
        // 为 userId / fileId 创建 payload 索引
        optimizers_config: {
          indexing_threshold: 100,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create collection: ${res.status} ${text}`);
    }

    // 创建 payload 索引
    await createPayloadIndex("userId", "keyword");
    await createPayloadIndex("fileId", "keyword");

    logger.info(
      { collection: COLLECTION_NAME, vectorDim: getVectorDim() },
      "Qdrant collection created",
    );
  } catch (error) {
    logger.error({ err: error }, "Failed to ensure Qdrant collection");
    throw error;
  }
}

async function createPayloadIndex(
  fieldName: string,
  fieldSchema: string,
): Promise<void> {
  await qdrantFetch(`/collections/${COLLECTION_NAME}/index`, {
    method: "PUT",
    body: JSON.stringify({
      field_name: fieldName,
      field_schema: fieldSchema,
    }),
  });
}

// Point 操作
export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export async function upsertPoints(points: QdrantPoint[]): Promise<void> {
  if (points.length === 0) return;

  const res = await qdrantFetch(`/collections/${COLLECTION_NAME}/points`, {
    method: "PUT",
    body: JSON.stringify({
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant upsert failed: ${res.status} ${text}`);
  }
}

export async function deletePointsByFilter(
  filter: Record<string, unknown>,
): Promise<void> {
  const res = await qdrantFetch(
    `/collections/${COLLECTION_NAME}/points/delete`,
    {
      method: "POST",
      body: JSON.stringify({ filter }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant delete failed: ${res.status} ${text}`);
  }
}

export async function deletePointsByFileId(fileId: string): Promise<void> {
  await deletePointsByFilter({
    must: [{ key: "fileId", match: { value: fileId } }],
  });
}

export async function deletePointsByUserId(userId: string): Promise<void> {
  await deletePointsByFilter({
    must: [{ key: "userId", match: { value: userId } }],
  });
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export async function searchPoints(
  vector: number[],
  userId: string,
  limit: number = 10,
  scoreThreshold: number = 0.1,
): Promise<SearchResult[]> {
  const res = await qdrantFetch(
    `/collections/${COLLECTION_NAME}/points/search`,
    {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit,
        score_threshold: scoreThreshold,
        filter: {
          must: [{ key: "userId", match: { value: userId } }],
        },
        with_payload: true,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant search failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    result: Array<{
      id: string;
      score: number;
      payload: Record<string, unknown>;
    }>;
  };

  return data.result.map((r) => ({
    id: r.id,
    score: r.score,
    payload: r.payload,
  }));
}

export async function getCollectionInfo(): Promise<{
  pointsCount: number;
  segmentsCount: number;
  status: string;
} | null> {
  try {
    const res = await qdrantFetch(`/collections/${COLLECTION_NAME}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result: {
        points_count: number;
        segments_count: number;
        status: string;
      };
    };
    return {
      pointsCount: data.result.points_count,
      segmentsCount: data.result.segments_count,
      status: data.result.status,
    };
  } catch {
    return null;
  }
}

export async function countPoints(
  filter: Record<string, unknown>,
): Promise<number> {
  const res = await qdrantFetch(
    `/collections/${COLLECTION_NAME}/points/count`,
    {
      method: "POST",
      body: JSON.stringify({ filter, exact: true }),
    },
  );
  if (!res.ok) return 0;
  const data = (await res.json()) as { result: { count: number } };
  return data.result.count;
}

export async function countUserPoints(userId: string): Promise<number> {
  return countPoints({
    must: [{ key: "userId", match: { value: userId } }],
  });
}

export async function qdrantHealthCheck(): Promise<boolean> {
  try {
    const res = await qdrantFetch("/healthz");
    return res.ok;
  } catch {
    return false;
  }
}
