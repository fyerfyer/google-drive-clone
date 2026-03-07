import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { McpAuthContext, resolveUserId } from "../auth/auth";
import { logger } from "../../lib/logger";
import { McpServices } from "../server";
import File from "../../models/File.model";
import { EMBEDDING_STATUS } from "../../types/model.types";

export function registerKnowledgeTools(
  server: McpServer,
  services: McpServices,
  authContext: McpAuthContext,
): void {
  const { knowledgeService } = services;

  server.registerTool(
    "semantic_search_files",
    {
      description:
        "Search files using natural language and vector embeddings. Returns matching text chunks with relevance scores. " +
        "Files are automatically indexed in the background when uploaded or modified — no manual indexing needed. " +
        "WHEN TO USE: When the user asks about topics, concepts, or content across files (e.g., 'what files discuss deployment?', 'find anything about budgets'). " +
        "WHEN NOT TO USE: When the user asks for a specific file by name (use search_files). When you already have the file ID and need its full content (use extract_file_content). " +
        "NOTES: If some files are still being indexed, the response will include a notice. Falls back to keyword search if semantic search is unavailable.",
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

        // 检查是否有文件正在索引中
        const pendingCount = await File.countDocuments({
          user: resolvedUserId,
          isTrashed: false,
          embeddingStatus: {
            $in: [EMBEDDING_STATUS.PENDING, EMBEDDING_STATUS.PROCESSING],
          },
        });

        const results = await knowledgeService.semanticSearch(
          resolvedUserId,
          query,
          limit || 10,
        );

        const response: Record<string, unknown> = {
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
        };

        if (pendingCount > 0) {
          response.notice = `${pendingCount} file(s) are still being indexed. Results may be incomplete — try again shortly for full coverage.`;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
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

  server.registerTool(
    "get_indexing_status",
    {
      description:
        "Get the current indexing status: how many files are indexed, chunk count, indexing percentage, and files in progress. " +
        "Files are automatically indexed when uploaded — this tool shows the pipeline progress. " +
        "WHEN TO USE: When the user asks 'are my files indexed?' or wants to know the AI readiness of their files. " +
        "WHEN NOT TO USE: When you just need to perform a search (use semantic_search_files directly).",
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

        // 获取按状态的文件计数
        const statusCounts = await File.aggregate([
          {
            $match: {
              user: resolvedUserId,
              isTrashed: false,
              embeddingStatus: { $exists: true, $ne: EMBEDDING_STATUS.NONE },
            },
          },
          { $group: { _id: "$embeddingStatus", count: { $sum: 1 } } },
        ]);

        const byStatus: Record<string, number> = {};
        for (const s of statusCounts) {
          byStatus[s._id as string] = s.count;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ...status,
                  embeddingPipeline: {
                    pending: byStatus[EMBEDDING_STATUS.PENDING] || 0,
                    processing: byStatus[EMBEDDING_STATUS.PROCESSING] || 0,
                    completed: byStatus[EMBEDDING_STATUS.COMPLETED] || 0,
                    failed: byStatus[EMBEDDING_STATUS.FAILED] || 0,
                  },
                  indexingPercentage:
                    status.totalFiles > 0
                      ? Math.round(
                          (status.indexedFiles / status.totalFiles) * 100,
                        )
                      : 0,
                  note: "Files are automatically indexed when uploaded or modified. No manual indexing needed.",
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
