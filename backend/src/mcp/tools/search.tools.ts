import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServices } from "../server";
import { McpAuthContext, resolveUserId } from "../auth/auth";
import { logger } from "../../lib/logger";

const userIdParam = z
  .string()
  .optional()
  .describe("The user ID. Optional if authenticated via 'authenticate' tool.");

export function registerSearchTools(
  server: McpServer,
  services: McpServices,
  authContext: McpAuthContext,
): void {
  const { fileService, folderService } = services;

  server.registerTool(
    "search_files",
    {
      description:
        "Search for files by name pattern. Returns matching files across the user's entire drive.",
      inputSchema: z.object({
        userId: userIdParam,
        query: z
          .string()
          .describe(
            "Search query to match against file names (case-insensitive)",
          ),
        fileType: z
          .string()
          .optional()
          .describe(
            "Optional file extension filter (e.g., 'docx', 'pdf', 'txt')",
          ),
      }),
    },
    async ({ userId: rawUserId, query, fileType }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        const allFiles = await fileService.getAllUserFiles(userId);
        const queryLower = query.toLowerCase();

        let matchedFiles = allFiles.filter((f) =>
          f.name.toLowerCase().includes(queryLower),
        );

        if (fileType) {
          const extLower = fileType.toLowerCase().replace(/^\./, "");
          matchedFiles = matchedFiles.filter(
            (f) => f.extension?.toLowerCase() === extLower,
          );
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  query,
                  fileType: fileType || "any",
                  matchCount: matchedFiles.length,
                  files: matchedFiles.map((f) => ({
                    id: f.id,
                    name: f.name,
                    size: f.size,
                    mimeType: f.mimeType,
                    extension: f.extension,
                    folder: f.folder,
                    updatedAt: f.updatedAt,
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
        logger.error(
          { error: message, rawUserId, query },
          "MCP search_files failed",
        );
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "summarize_directory",
    {
      description:
        "Get a summary of a directory's contents including file count, total size, and file type distribution.",
      inputSchema: z.object({
        userId: userIdParam,
        folderId: z
          .string()
          .describe(
            "The folder ID to summarize. Use 'root' for root directory.",
          ),
      }),
    },
    async ({ userId: rawUserId, folderId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        const content = await folderService.getFolderContent(folderId, userId);

        const totalFileSize = content.files.reduce((sum, f) => sum + f.size, 0);
        const fileTypeDistribution: Record<string, number> = {};
        for (const file of content.files) {
          const ext = file.extension || "unknown";
          fileTypeDistribution[ext] = (fileTypeDistribution[ext] || 0) + 1;
        }

        const starredCount =
          content.files.filter((f) => f.isStarred).length +
          content.folders.filter((f) => f.isStarred).length;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  directory: content.currentFolder
                    ? {
                        id: content.currentFolder.id,
                        name: content.currentFolder.name,
                      }
                    : { id: "root", name: "My Drive" },
                  summary: {
                    folderCount: content.folders.length,
                    fileCount: content.files.length,
                    totalItems: content.folders.length + content.files.length,
                    totalFileSize,
                    totalFileSizeHuman: formatBytes(totalFileSize),
                    starredCount,
                    fileTypeDistribution,
                  },
                  recentlyModified: content.files
                    .sort(
                      (a, b) =>
                        new Date(b.updatedAt).getTime() -
                        new Date(a.updatedAt).getTime(),
                    )
                    .slice(0, 5)
                    .map((f) => ({
                      name: f.name,
                      updatedAt: f.updatedAt,
                      size: f.size,
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
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "query_workspace_knowledge",
    {
      description:
        "Query workspace knowledge using natural language. " +
        "For best results, ensure files are indexed first using 'index_file' or 'index_all_files'. " +
        "Falls back to keyword matching if semantic search is unavailable.",
      inputSchema: z.object({
        userId: userIdParam,
        query: z
          .string()
          .describe("Natural language query about workspace content"),
      }),
    },
    async ({ userId: rawUserId, query }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);

        // 优先使用 Knowledge Layer 的语义搜索（通过 semantic_search_files 工具）
        // 这里做关键词兜底
        const allFiles = await fileService.getAllUserFiles(userId);
        const queryWords = query.toLowerCase().split(/\s+/);

        const matchedFiles = allFiles
          .map((f) => {
            const nameLower = f.name.toLowerCase();
            const score = queryWords.filter((w) =>
              nameLower.includes(w),
            ).length;
            return { file: f, score };
          })
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  query,
                  note: "This is keyword-based search. For semantic search with natural language understanding, use the 'semantic_search_files' tool after indexing files.",
                  matchCount: matchedFiles.length,
                  results: matchedFiles.map((r) => ({
                    file: {
                      id: r.file.id,
                      name: r.file.name,
                      size: r.file.size,
                      mimeType: r.file.mimeType,
                      updatedAt: r.file.updatedAt,
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
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
