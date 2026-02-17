// 文件相关操作
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServices } from "../server";
import { logger } from "../../lib/logger";

export function registerFileTools(
  server: McpServer,
  services: McpServices,
): void {
  const { fileService } = services;

  server.registerTool(
    "list_files",
    {
      description:
        "List all files for the authenticated user. Returns file metadata including name, size, type, and timestamps.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID to list files for"),
        filter: z
          .enum(["all", "starred", "trashed", "recent"])
          .optional()
          .describe("Filter files by category. Defaults to 'all'"),
        limit: z
          .number()
          .optional()
          .describe(
            "Maximum number of recent files to return (only for 'recent' filter)",
          ),
      }),
    },
    async ({ userId, filter = "all", limit }) => {
      try {
        let files;
        switch (filter) {
          case "starred":
            files = await fileService.getStarredFiles(userId);
            break;
          case "trashed":
            files = await fileService.getTrashedFiles(userId);
            break;
          case "recent":
            files = await fileService.getRecentFiles(userId, limit || 20);
            break;
          default:
            files = await fileService.getAllUserFiles(userId);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  count: files.length,
                  filter,
                  files: files.map((f) => ({
                    id: f.id,
                    name: f.name,
                    size: f.size,
                    mimeType: f.mimeType,
                    extension: f.extension,
                    isStarred: f.isStarred,
                    isTrashed: f.isTrashed,
                    folder: f.folder,
                    createdAt: f.createdAt,
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
        logger.error({ error: message, userId }, "MCP list_files failed");
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_file_info",
    {
      description:
        "Get detailed information about a specific file, including metadata and permissions.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        fileId: z.string().describe("The file ID to get information for"),
      }),
    },
    async ({ userId, fileId }) => {
      try {
        const file = await fileService.getFileById(fileId, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(file, null, 2),
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
    "read_file",

    {
      description:
        "Read the text content of a file. Only works for text-based files (txt, md, json, csv, etc.).",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        fileId: z.string().describe("The file ID to read"),
      }),
    },
    async ({ userId, fileId }) => {
      try {
        const result = await fileService.getFileContent({
          userId,
          fileId,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  file: {
                    id: result.file.id,
                    name: result.file.name,
                    size: result.file.size,
                    mimeType: result.file.mimeType,
                  },
                  content: result.content,
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
    "write_file",
    {
      description:
        "Update the text content of an existing file. Only works for text-based files.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        fileId: z.string().describe("The file ID to write to"),
        content: z.string().describe("The new text content for the file"),
      }),
    },
    async ({ userId, fileId, content }) => {
      try {
        const file = await fileService.updateFileContent({
          userId,
          fileId,
          content,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  file: {
                    id: file.id,
                    name: file.name,
                    size: file.size,
                    updatedAt: file.updatedAt,
                  },
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
    "create_file",
    {
      description:
        "Create a new blank file in the user's drive. Supports txt, md, docx, xlsx, pptx, and other formats.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        folderId: z
          .string()
          .describe(
            "The folder ID where the file will be created. Use 'root' for root directory.",
          ),
        fileName: z
          .string()
          .describe(
            "The name of the file to create (e.g., 'notes.md', 'report.docx')",
          ),
        content: z
          .string()
          .optional()
          .describe("Optional initial text content for text-based files"),
      }),
    },
    async ({ userId, folderId, fileName, content }) => {
      try {
        const file = await fileService.createBlankFile({
          userId,
          folderId: folderId === "root" ? "" : folderId,
          fileName,
          content,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  file: {
                    id: file.id,
                    name: file.name,
                    size: file.size,
                    mimeType: file.mimeType,
                    createdAt: file.createdAt,
                  },
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
    "rename_file",
    {
      description: "Rename an existing file.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        fileId: z.string().describe("The file ID to rename"),
        newName: z.string().describe("The new name for the file"),
      }),
    },
    async ({ userId, fileId, newName }) => {
      try {
        await fileService.renameFile(fileId, userId, newName);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, fileId, newName }),
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
    "move_file",
    {
      description: "Move a file to a different folder.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        fileId: z.string().describe("The file ID to move"),
        destinationFolderId: z
          .string()
          .describe(
            "The destination folder ID. Use 'root' for root directory.",
          ),
      }),
    },
    async ({ userId, fileId, destinationFolderId }) => {
      try {
        await fileService.moveFile(
          fileId,
          userId,
          destinationFolderId === "root" ? "" : destinationFolderId,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                fileId,
                destinationFolderId,
              }),
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
    "trash_file",
    {
      description: "Move a file to the trash. The file can be restored later.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        fileId: z.string().describe("The file ID to trash"),
      }),
    },
    async ({ userId, fileId }) => {
      try {
        await fileService.trashFile(fileId, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                fileId,
                action: "trashed",
              }),
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
    "restore_file",
    {
      description: "Restore a file from the trash.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        fileId: z.string().describe("The file ID to restore"),
      }),
    },
    async ({ userId, fileId }) => {
      try {
        await fileService.restoreFile(fileId, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                fileId,
                action: "restored",
              }),
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
    "delete_file",
    {
      description: "Permanently delete a file. This action cannot be undone.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        fileId: z.string().describe("The file ID to permanently delete"),
      }),
    },
    async ({ userId, fileId }) => {
      try {
        await fileService.deleteFilePermanent(fileId, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                fileId,
                action: "permanently_deleted",
              }),
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
    "star_file",
    {
      description: "Star or unstar a file to mark it as important.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        fileId: z.string().describe("The file ID"),
        star: z
          .boolean()
          .describe("Whether to star (true) or unstar (false) the file"),
      }),
    },
    async ({ userId, fileId, star }) => {
      try {
        await fileService.starFile(fileId, userId, star);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                fileId,
                starred: star,
              }),
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
    "get_download_url",
    {
      description:
        "Get a presigned download URL for a file. The URL is valid for a limited time.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        fileId: z.string().describe("The file ID to download"),
      }),
    },
    async ({ userId, fileId }) => {
      try {
        const result = await fileService.getPresignedDownloadUrl({
          userId,
          fileId,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  downloadUrl: result.url,
                  fileName: result.fileName,
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
