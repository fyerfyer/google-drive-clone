import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { McpAuthContext, resolveUserId } from "../auth/auth";
import { logger } from "../../lib/logger";
import { McpServices } from "../server";

export function registerKnowledgeTools(
  server: McpServer,
  services: McpServices,
  authContext: McpAuthContext,
): void {
  const { knowledgeService } = services;
  server.registerTool(
    "index_file",
    {
      description:
        "Index a single file for semantic search. Extracts text, splits into chunks, generates vector embeddings. " +
        "WHEN TO USE: When a specific file needs to be indexed before semantic search can find it. " +
        "WHEN NOT TO USE: When the user just wants to search (use semantic_search_files — it works on already-indexed files). " +
        "NOTES: Supports text, PDF, and DOCX. After indexing, the file is searchable via semantic_search_files.",
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

  server.registerTool(
    "index_all_files",
    {
      description:
        "Batch-index ALL text-based files in the user's drive for semantic search. " +
        "WHEN TO USE: When the user wants their entire drive searchable, or asks to 'index everything'. " +
        "WHEN NOT TO USE: When only a single file needs indexing (use index_file). " +
        "NOTES: May take a while for large collections. Supports text, PDF, and DOCX.",
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

  server.registerTool(
    "semantic_search_files",
    {
      description:
        "Search indexed files using natural language and vector embeddings. Returns matching text chunks with relevance scores. " +
        "WHEN TO USE: When the user asks about topics, concepts, or content across files (e.g., 'what files discuss deployment?', 'find anything about budgets'). " +
        "WHEN NOT TO USE: When the user asks for a specific file by name (use search_files). When you already have the file ID and need its full content (use extract_file_content). " +
        "NOTES: Files must be indexed first (index_file / index_all_files). Falls back to keyword search if semantic search is unavailable.",
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

  server.registerTool(
    "get_indexing_status",
    {
      description:
        "Get the current indexing status: how many files are indexed, chunk count, and indexing percentage. " +
        "WHEN TO USE: When the user asks 'are my files indexed?' or when semantic search returns no results and you suspect files aren't indexed. " +
        "WHEN NOT TO USE: When you just need to perform a search (use semantic_search_files directly). " +
        "NOTES: If indexingPercentage is low, suggest using index_all_files.",
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
