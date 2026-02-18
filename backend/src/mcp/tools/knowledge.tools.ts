import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { KnowledgeService } from "../../services/knowledge.service";
import { McpAuthContext, resolveUserId } from "../auth/auth";
import { logger } from "../../lib/logger";

export function registerKnowledgeTools(
  server: McpServer,
  knowledgeService: KnowledgeService,
  authContext: McpAuthContext,
): void {
  // -----------------------------------------------------------------------
  // index_file — 为单个文件建立语义索引
  // -----------------------------------------------------------------------
  server.registerTool(
    "index_file",
    {
      description:
        "Index a file for semantic search. Extracts text content, splits it into chunks, " +
        "and generates vector embeddings. Supports text files, PDF, and DOCX. " +
        "After indexing, the file can be found through semantic_search_files.",
      inputSchema: z.object({
        userId: z
          .string()
          .optional()
          .describe(
            "The user ID. Optional if authenticated via 'authenticate' tool.",
          ),
        fileId: z.string().describe("The file ID to index"),
      }),
    },
    async ({ userId, fileId }) => {
      try {
        const resolvedUserId = resolveUserId(userId, authContext);
        const chunkCount = await knowledgeService.indexFile(
          fileId,
          resolvedUserId,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                fileId,
                chunksCreated: chunkCount,
                message:
                  chunkCount > 0
                    ? `File indexed successfully with ${chunkCount} chunks.`
                    : "No text content could be extracted from this file.",
              }),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error({ err: error, fileId }, "MCP index_file failed");
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // index_all_files — 批量索引用户所有文本文件
  // -----------------------------------------------------------------------
  server.registerTool(
    "index_all_files",
    {
      description:
        "Index all text-based files in the user's drive for semantic search. " +
        "This may take a while for large collections. Supports text files, PDF, and DOCX.",
      inputSchema: z.object({
        userId: z
          .string()
          .optional()
          .describe(
            "The user ID. Optional if authenticated via 'authenticate' tool.",
          ),
      }),
    },
    async ({ userId }) => {
      try {
        const resolvedUserId = resolveUserId(userId, authContext);
        const result = await knowledgeService.indexAllFiles(resolvedUserId);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                ...result,
                message: `Indexing complete: ${result.indexed} files indexed, ${result.skipped} skipped, ${result.errors} errors.`,
              }),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error({ err: error }, "MCP index_all_files failed");
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // semantic_search_files — 语义搜索
  // -----------------------------------------------------------------------
  server.registerTool(
    "semantic_search_files",
    {
      description:
        "Search files using natural language semantic understanding. " +
        "Uses vector embeddings to find relevant content across the user's indexed files. " +
        "Returns matching text chunks with relevance scores. " +
        "Note: Files must be indexed first using 'index_file' or 'index_all_files'.",
      inputSchema: z.object({
        userId: z
          .string()
          .optional()
          .describe(
            "The user ID. Optional if authenticated via 'authenticate' tool.",
          ),
        query: z
          .string()
          .describe(
            "Natural language query (e.g., 'deployment configuration', 'error handling patterns')",
          ),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of results to return (default: 10)"),
      }),
    },
    async ({ userId, query, limit }) => {
      try {
        const resolvedUserId = resolveUserId(userId, authContext);
        const results = await knowledgeService.semanticSearch(
          resolvedUserId,
          query,
          limit || 10,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  query,
                  resultCount: results.length,
                  results: results.map((r) => ({
                    file: r.file,
                    chunk: {
                      id: r.chunk.id,
                      content:
                        r.chunk.content.length > 500
                          ? r.chunk.content.slice(0, 500) + "..."
                          : r.chunk.content,
                      chunkIndex: r.chunk.chunkIndex,
                    },
                    relevanceScore: r.score,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error({ err: error, query }, "MCP semantic_search_files failed");
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // get_indexing_status — 索引状态
  // -----------------------------------------------------------------------
  server.registerTool(
    "get_indexing_status",
    {
      description:
        "Get the current indexing status for the user's workspace. " +
        "Shows how many files are indexed and how many chunks exist.",
      inputSchema: z.object({
        userId: z
          .string()
          .optional()
          .describe(
            "The user ID. Optional if authenticated via 'authenticate' tool.",
          ),
      }),
    },
    async ({ userId }) => {
      try {
        const resolvedUserId = resolveUserId(userId, authContext);
        const status = await knowledgeService.getIndexingStatus(resolvedUserId);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ...status,
                  indexingPercentage:
                    status.totalFiles > 0
                      ? Math.round(
                          (status.indexedFiles / status.totalFiles) * 100,
                        )
                      : 0,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
