import FileChunk from "../models/FileChunk.model";
import File, { IFile } from "../models/File.model";
import { StorageService } from "./storage.service";
import { BUCKETS } from "../config/s3";
import { config } from "../config/env";
import { logger } from "../lib/logger";
import {
  upsertPoints,
  deletePointsByFileId,
  searchPoints,
  countUserPoints,
  QdrantPoint,
} from "../config/qdrant";
import mongoose from "mongoose";

/**
 * Convert a 24-char MongoDB ObjectID hex string to a valid UUID v4 format.
 * Qdrant only accepts UUIDs or unsigned integers as point IDs.
 * We pad the 24-char hex to 32 chars and format as UUID.
 */
function mongoIdToUuid(mongoId: string): string {
  const padded = mongoId.padEnd(32, "0");
  return [
    padded.slice(0, 8),
    padded.slice(8, 12),
    padded.slice(12, 16),
    padded.slice(16, 20),
    padded.slice(20, 32),
  ].join("-");
}

// 反向转换：从 UUID 提取 MongoDB ObjectID
function uuidToMongoId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 24);
}

interface ChunkResult {
  content: string;
  offset: number;
}

export interface SemanticSearchResult {
  file: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    updatedAt: Date;
  };
  chunk: {
    id: string;
    content: string;
    chunkIndex: number;
  };
  score: number; // 余弦相似度 (0~1)
}

export interface IndexingStatus {
  totalFiles: number;
  indexedFiles: number;
  totalChunks: number;
  indexedChunks: number;
  pendingChunks: number;
  qdrantPoints: number;
}

const TEXT_MIME_PREFIXES = [
  "text/",
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "application/xhtml+xml",
  "application/x-yaml",
  "application/x-sh",
  "application/x-python",
];

const BINARY_TEXT_MIMES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

function isTextExtractable(mimeType: string): boolean {
  if (TEXT_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) return true;
  if (mimeType in BINARY_TEXT_MIMES) return true;
  return false;
}

// TODO：之后可以把这个做成可配置的
const CHUNK_SIZE = 1000; // 目标 ~1000 字符/chunk
const CHUNK_OVERLAP = 150; // 150 字符重叠

function chunkText(text: string): ChunkResult[] {
  if (!text || text.trim().length === 0) return [];

  // 如果文本很短，直接作为单个 chunk
  if (text.length <= CHUNK_SIZE) {
    return [{ content: text.trim(), offset: 0 }];
  }

  const chunks: ChunkResult[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);

    // 尝试在句子边界处分割
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const lastSpace = text.lastIndexOf(" ", end);

      const boundary = Math.max(lastPeriod, lastNewline);
      if (boundary > start + CHUNK_SIZE * 0.5) {
        end = boundary + 1;
      } else if (lastSpace > start + CHUNK_SIZE * 0.5) {
        end = lastSpace + 1;
      }
    }

    const chunkContent = text.slice(start, end).trim();
    if (chunkContent.length > 0) {
      chunks.push({ content: chunkContent, offset: start });
    }

    start = end - CHUNK_OVERLAP;
    if (start >= text.length) break;
    // 防止无限循环
    if (start <= chunks[chunks.length - 1]?.offset) {
      start = end;
    }
  }

  return chunks;
}

export class KnowledgeService {
  constructor() {}

  private async extractText(file: IFile): Promise<string> {
    const mimeType = file.mimeType;

    if (!isTextExtractable(mimeType)) {
      throw new Error(`Unsupported file type for text extraction: ${mimeType}`);
    }

    // 获取文件内容 (key 需要通过 select 查询)
    const fileWithKey = await File.findById(file._id).select("+key").lean();
    if (!fileWithKey?.key) {
      throw new Error("File storage key not found");
    }

    const stream = await StorageService.getObjectStream(
      BUCKETS.FILES,
      fileWithKey.key,
    );

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    // PDF 提取 (pdf-parse v2 uses PDFParse class)
    if (mimeType === "application/pdf") {
      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        await parser.destroy();
        return result.text;
      } catch (error) {
        logger.warn({ err: error, fileId: file._id }, "PDF extraction failed");
        return "";
      }
    }

    // Word (.docx) 提取
    if (BINARY_TEXT_MIMES[mimeType] === "docx") {
      if (buffer.length === 0) {
        logger.warn({ fileId: file._id }, "DOCX buffer is empty, skipping");
        return "";
      }
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } catch (error) {
        logger.warn({ err: error, fileId: file._id }, "DOCX extraction failed");
        return "";
      }
    }

    // 其他文本文件直接解码
    return buffer.toString("utf-8");
  }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // 优先使用独立的 Embedding API Key，回退到 LLM API Key
    const apiKey = config.embeddingApiKey;
    const baseUrl = config.embeddingBaseUrl;
    const model = config.embeddingModel;

    if (!apiKey) {
      throw new Error(
        "Embedding API not configured. Set EMBEDDING_API_KEY (or LLM_API_KEY as fallback) environment variable.",
      );
    }

    logger.debug(
      { baseUrl, model, inputCount: texts.length },
      "Calling embedding API...",
    );

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts,
        dimensions: config.embeddingDimension,
        encoding_format: "float",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { status: response.status, errorBody: errorText, baseUrl, model },
        "Embedding API error",
      );
      throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // 按 index 排序后返回
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  async indexFile(fileId: string, userId: string): Promise<number> {
    const file = await File.findOne({
      _id: fileId,
      user: userId,
      isTrashed: false,
    });

    if (!file) {
      throw new Error("File not found or access denied");
    }

    if (!isTextExtractable(file.mimeType)) {
      throw new Error(
        `File type ${file.mimeType} is not supported for indexing. Supported: text files, PDF, DOCX.`,
      );
    }

    // 删除旧数据（MongoDB + Qdrant）
    await FileChunk.deleteMany({ file: file._id });
    await deletePointsByFileId(fileId);

    // 提取文本
    const text = await this.extractText(file);
    if (!text || text.trim().length === 0) {
      logger.info({ fileId }, "No text content extracted, skipping indexing");
      return 0;
    }

    // 分块
    const textChunks = chunkText(text);
    if (textChunks.length === 0) return 0;

    logger.info(
      { fileId, fileName: file.name, chunkCount: textChunks.length },
      "Chunking complete, generating embeddings...",
    );

    // 生成 embeddings（分批处理，每批最多 10 个 — Qwen API 限制）
    const BATCH_SIZE = 10;
    const allEmbeddings: (number[] | null)[] = [];

    for (let i = 0; i < textChunks.length; i += BATCH_SIZE) {
      const batch = textChunks.slice(i, i + BATCH_SIZE);
      const batchTexts = batch.map((c) => c.content);
      try {
        const embeddings = await this.generateEmbeddings(batchTexts);
        allEmbeddings.push(...embeddings);
      } catch (error) {
        logger.error(
          { err: error, fileId, batch: i },
          "Embedding generation failed for batch",
        );
        // 标记这些 chunk 没有 embedding
        for (const _c of batch) {
          allEmbeddings.push(null);
        }
      }
    }

    // 1) 批量写入 MongoDB（文本内容 + 元数据，不含 embedding）
    const chunkDocs = textChunks.map((chunk, index) => ({
      file: new mongoose.Types.ObjectId(fileId),
      user: new mongoose.Types.ObjectId(userId),
      chunkIndex: index,
      content: chunk.content,
      metadata: {
        fileName: file.name,
        mimeType: file.mimeType,
        fileSize: file.size,
        chunkOffset: chunk.offset,
        totalChunks: textChunks.length,
      },
      isIndexed: allEmbeddings[index] != null,
    }));

    const savedChunks = await FileChunk.insertMany(chunkDocs);

    // 2) 批量写入 Qdrant（向量 + payload）
    // Qdrant 只接受 unsigned integer 或 UUID 作为 point ID
    const qdrantPoints: QdrantPoint[] = [];
    for (let i = 0; i < savedChunks.length; i++) {
      const embedding = allEmbeddings[i];
      if (!embedding || embedding.length === 0) continue;

      const mongoId = savedChunks[i]._id.toString();
      qdrantPoints.push({
        id: mongoIdToUuid(mongoId),
        vector: embedding,
        payload: {
          userId,
          fileId,
          chunkIndex: i,
          fileName: file.name,
          mimeType: file.mimeType,
          mongoChunkId: mongoId, // 保存原始 MongoDB _id 用于反查
        },
      });
    }

    if (qdrantPoints.length > 0) {
      try {
        // 分批写入 Qdrant
        const QDRANT_BATCH = 100;
        for (let i = 0; i < qdrantPoints.length; i += QDRANT_BATCH) {
          const batch = qdrantPoints.slice(i, i + QDRANT_BATCH);
          await upsertPoints(batch);
        }
      } catch (error) {
        logger.error(
          { err: error, fileId },
          "Failed to upsert vectors to Qdrant",
        );
        // 向量写入失败时，标记 chunk 为未索引
        await FileChunk.updateMany(
          { file: fileId },
          { $set: { isIndexed: false } },
        );
      }
    }

    const indexedCount = qdrantPoints.length;
    logger.info(
      {
        fileId,
        fileName: file.name,
        totalChunks: textChunks.length,
        indexedChunks: indexedCount,
      },
      "File indexed successfully",
    );

    return textChunks.length;
  }

  async removeFileIndex(fileId: string): Promise<void> {
    await Promise.all([
      FileChunk.deleteMany({ file: fileId }),
      deletePointsByFileId(fileId),
    ]);
    logger.info({ fileId }, "File index removed (MongoDB + Qdrant)");
  }

  async semanticSearch(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<SemanticSearchResult[]> {
    // 1. 生成查询向量
    let queryEmbedding: number[];
    try {
      const embeddings = await this.generateEmbeddings([query]);
      queryEmbedding = embeddings[0];
    } catch (error) {
      logger.warn(
        { err: error },
        "Embedding generation failed, falling back to keyword search",
      );
      return this.keywordSearch(userId, query, limit);
    }

    // 2. Qdrant 向量搜索
    let searchResults;
    try {
      searchResults = await searchPoints(queryEmbedding, userId, limit, 0.1);
    } catch (error) {
      logger.warn(
        { err: error },
        "Qdrant search failed, falling back to keyword search",
      );
      return this.keywordSearch(userId, query, limit);
    }

    if (searchResults.length === 0) {
      logger.info(
        { userId },
        "No Qdrant results, falling back to keyword search",
      );
      return this.keywordSearch(userId, query, limit);
    }

    // 3. 从 MongoDB 获取对应的 chunk 文本内容
    // Qdrant point ID 是 UUID，通过 payload.mongoChunkId 反查 MongoDB
    const chunkIds = searchResults.map(
      (r) => (r.payload.mongoChunkId as string) || uuidToMongoId(r.id),
    );
    const chunks = await FileChunk.find({ _id: { $in: chunkIds } }).lean();
    const chunkMap = new Map(
      chunks.map((c) => [(c._id as mongoose.Types.ObjectId).toString(), c]),
    );

    // 4. 获取对应的文件信息
    const fileIds = [
      ...new Set(searchResults.map((r) => r.payload.fileId as string)),
    ];
    const files = await File.find({ _id: { $in: fileIds } }).lean();
    const fileMap = new Map(files.map((f) => [f._id.toString(), f]));

    // 5. 组装结果
    return searchResults
      .map((r) => {
        const mongoId =
          (r.payload.mongoChunkId as string) || uuidToMongoId(r.id);
        const chunk = chunkMap.get(mongoId);
        const file = fileMap.get(r.payload.fileId as string);

        if (!chunk) return null;

        return {
          file: {
            id: (r.payload.fileId as string) || "",
            name: file?.name || (r.payload.fileName as string) || "Unknown",
            mimeType: file?.mimeType || (r.payload.mimeType as string) || "",
            size: file?.size || 0,
            updatedAt: file?.updatedAt || new Date(),
          },
          chunk: {
            id: r.id,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
          },
          score: Math.round(r.score * 10000) / 10000,
        };
      })
      .filter((r): r is SemanticSearchResult => r !== null);
  }

  private async keywordSearch(
    userId: string,
    query: string,
    limit: number,
  ): Promise<SemanticSearchResult[]> {
    let chunks: any[];
    try {
      chunks = await FileChunk.find(
        { user: userId, $text: { $search: query } },
        { score: { $meta: "textScore" } },
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .lean();
    } catch {
      // text index 可能还没建好，用正则兜底
      const words = query
        .split(/\s+/)
        .filter((w) => w.length > 1)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (words.length === 0) return [];
      const regex = new RegExp(words.join("|"), "i");
      chunks = await FileChunk.find({ user: userId, content: regex })
        .limit(limit)
        .lean();
    }

    const fileIds = [...new Set(chunks.map((c: any) => c.file.toString()))];
    const files = await File.find({ _id: { $in: fileIds } }).lean();
    const fileMap = new Map(files.map((f) => [f._id.toString(), f]));

    return chunks.map((c: any) => {
      const file = fileMap.get(c.file.toString());
      return {
        file: {
          id: c.file.toString(),
          name: file?.name || c.metadata.fileName,
          mimeType: file?.mimeType || c.metadata.mimeType,
          size: file?.size || c.metadata.fileSize,
          updatedAt: file?.updatedAt || new Date(),
        },
        chunk: {
          id: c._id.toString(),
          content: c.content,
          chunkIndex: c.chunkIndex,
        },
        score: c.score || 0.5,
      };
    });
  }

  async indexAllFiles(
    userId: string,
  ): Promise<{ indexed: number; skipped: number; errors: number }> {
    const files = await File.find({
      user: userId,
      isTrashed: false,
    }).lean();

    let indexed = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of files) {
      if (!isTextExtractable(file.mimeType)) {
        skipped++;
        continue;
      }

      try {
        const chunkCount = await this.indexFile(file._id.toString(), userId);
        if (chunkCount > 0) indexed++;
        else skipped++;
      } catch (error) {
        logger.error(
          { err: error, fileId: file._id, fileName: file.name },
          "Failed to index file",
        );
        errors++;
      }
    }

    return { indexed, skipped, errors };
  }

  async getIndexingStatus(userId: string): Promise<IndexingStatus> {
    const totalFiles = await File.countDocuments({
      user: userId,
      isTrashed: false,
    });

    const indexedFileIds = await FileChunk.distinct("file", { user: userId });
    const indexedFiles = indexedFileIds.length;

    const totalChunks = await FileChunk.countDocuments({ user: userId });
    const indexedChunks = await FileChunk.countDocuments({
      user: userId,
      isIndexed: true,
    });

    // Qdrant 向量数量
    let qdrantPoints = 0;
    try {
      qdrantPoints = await countUserPoints(userId);
    } catch {
      // Qdrant 不可用时忽略
    }

    return {
      totalFiles,
      indexedFiles,
      totalChunks,
      indexedChunks,
      pendingChunks: totalChunks - indexedChunks,
      qdrantPoints,
    };
  }

  async getFileChunks(fileId: string, userId: string) {
    return FileChunk.find({ file: fileId, user: userId })
      .sort({ chunkIndex: 1 })
      .lean();
  }

  isIndexable(mimeType: string): boolean {
    return isTextExtractable(mimeType);
  }
}
