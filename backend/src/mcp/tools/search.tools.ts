import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServices } from "../server";
import { logger } from "../../lib/logger";

export function registerSearchTools(
  server: McpServer,
  services: McpServices,
): void {
  const { fileService, folderService } = services;

  server.registerTool(
    "search_files",
    {
      description:
        "Search for files by name pattern. Returns matching files across the user's entire drive.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
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
    async ({ userId, query, fileType }) => {
      try {
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
          { error: message, userId, query },
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
        userId: z.string().describe("The user ID"),
        folderId: z
          .string()
          .describe(
            "The folder ID to summarize. Use 'root' for root directory.",
          ),
      }),
    },
    async ({ userId, folderId }) => {
      try {
        const content = await folderService.getFolderContent(
          folderId === "root" ? "" : folderId,
          userId,
        );

        // 统计量计算
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

  // TODO：之后引入 Embedding 层后具体实现
  server.registerTool(
    "query_workspace_knowledge",
    {
      description:
        "Semantic search across workspace using embeddings. Currently falls back to keyword matching.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        query: z
          .string()
          .describe("Natural language query about workspace content"),
      }),
    },
    async ({ userId, query }) => {
      try {
        // TODO：当前只进行关键词匹配，未来将接入向量检索
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
                  note: "Currently using keyword matching. Semantic search with embeddings will be available in a future update.",
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
