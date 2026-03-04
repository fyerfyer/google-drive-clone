import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServices } from "../server";
import { McpAuthContext, resolveUserId } from "../auth/auth";
import { logger } from "../../lib/logger";
import { formatBytes } from "../../utils/mcp.util";

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
        "Search for files by name pattern (case-insensitive substring match). " +
        "WHEN TO USE: When the user asks for a file by name, extension, or filename pattern (e.g., 'find budget.xlsx', 'find all PDFs'). " +
        "WHEN NOT TO USE: When the user searches by content or meaning (use semantic_search_files). " +
        "NOTES: Searches file names only, not content. Supports optional fileType filter for extensions.",
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
        "Get a statistical summary of a directory: file count, total size, type distribution, recently modified files. " +
        "WHEN TO USE: When the user asks 'what\'s in this folder', 'how big is this directory', or wants an overview without listing every file. " +
        "WHEN NOT TO USE: When the user needs a full file listing (use list_folder_contents). If a drive://folders/{folderId} resource already provides this, do not call. " +
        "NOTES: Use folderId='root' for root directory. Returns aggregate stats, not individual file contents.",
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
}
