// 文件相关操作 — Smart Tool 模式
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServices } from "../server";
import { McpAuthContext, resolveUserId } from "../auth/auth";
import { logger } from "../../lib/logger";
import { KnowledgeService } from "../../services/knowledge.service";

const userIdParam = z
  .string()
  .optional()
  .describe("The user ID. Optional if authenticated via 'authenticate' tool.");

export function registerFileTools(
  server: McpServer,
  services: McpServices,
  authContext: McpAuthContext,
): void {
  const { fileService } = services;
  const knowledgeService = services.knowledgeService;

  server.registerTool(
    "list_files",
    {
      description:
        "List all files for the authenticated user. Returns file metadata including name, size, type, and timestamps.",
      inputSchema: z.object({
        userId: userIdParam,
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
    async ({ userId: rawUserId, filter = "all", limit }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
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
        logger.error({ error: message, rawUserId }, "MCP list_files failed");
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
        userId: userIdParam,
        fileId: z.string().describe("The file ID to get information for"),
      }),
    },
    async ({ userId: rawUserId, fileId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
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

  // 统一文件提取，不需要关心格式
  server.registerTool(
    "extract_file_content",
    {
      description:
        "Read and extract the text content of ANY file, regardless of format. " +
        "Automatically handles text files (.txt, .md, .json, .ts, .py, etc.), " +
        "PDF documents (.pdf), and Word documents (.docx). " +
        "The backend transparently parses binary formats and returns clean text. " +
        "Use this tool when you need to read or review a file's content. " +
        "For very large files (>100KB), content is automatically truncated with a note. " +
        "For binary files that cannot be parsed (images, videos, etc.), use 'get_download_url' instead.",
      inputSchema: z.object({
        userId: userIdParam,
        fileId: z.string().describe("The file ID to read content from"),
      }),
    },
    async ({ userId: rawUserId, fileId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);

        const { text, file, extractionMethod } =
          await knowledgeService.extractFileContent(fileId, userId);

        // 智能截断：超过限制时自动截断并给出提示
        const MAX_CONTENT_CHARS = 100_000; // ~25K tokens
        let content = text;
        let truncated = false;
        if (content && content.length > MAX_CONTENT_CHARS) {
          content = content.slice(0, MAX_CONTENT_CHARS);
          truncated = true;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  file: {
                    id: file._id?.toString() || fileId,
                    name: file.name,
                    size: file.size,
                    mimeType: file.mimeType,
                    extension: file.extension,
                  },
                  extractionMethod,
                  content,
                  ...(truncated
                    ? {
                        truncated: true,
                        originalLength: text.length,
                        note:
                          `Content truncated to ${MAX_CONTENT_CHARS} characters (original: ${text.length}). ` +
                          `Use 'semantic_search_files' for targeted queries on large files.`,
                      }
                    : {}),
                  ...(content.trim() === ""
                    ? {
                        note: "File appears to be empty or no text could be extracted.",
                      }
                    : {}),
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
          { error: message, rawUserId, fileId },
          "MCP extract_file_content failed",
        );
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
        userId: userIdParam,
        fileId: z.string().describe("The file ID to write to"),
        content: z.string().describe("The new text content for the file"),
      }),
    },
    async ({ userId: rawUserId, fileId, content }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
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
        userId: userIdParam,
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
    async ({ userId: rawUserId, folderId, fileName, content }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        const file = await fileService.createBlankFile({
          userId,
          // root 特殊处理（前端的一个固定设定）
          folderId: folderId === "root" ? "root" : folderId,
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
        userId: userIdParam,
        fileId: z.string().describe("The file ID to rename"),
        newName: z.string().describe("The new name for the file"),
      }),
    },
    async ({ userId: rawUserId, fileId, newName }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
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
        userId: userIdParam,
        fileId: z.string().describe("The file ID to move"),
        destinationFolderId: z
          .string()
          .describe(
            "The destination folder ID. Use 'root' for root directory.",
          ),
      }),
    },
    async ({ userId: rawUserId, fileId, destinationFolderId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        await fileService.moveFile(
          fileId,
          userId,
          destinationFolderId === "root" ? "root" : destinationFolderId,
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
        userId: userIdParam,
        fileId: z.string().describe("The file ID to trash"),
      }),
    },
    async ({ userId: rawUserId, fileId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
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
        userId: userIdParam,
        fileId: z.string().describe("The file ID to restore"),
      }),
    },
    async ({ userId: rawUserId, fileId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
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
        userId: userIdParam,
        fileId: z.string().describe("The file ID to permanently delete"),
      }),
    },
    async ({ userId: rawUserId, fileId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
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
        userId: userIdParam,
        fileId: z.string().describe("The file ID"),
        star: z
          .boolean()
          .describe("Whether to star (true) or unstar (false) the file"),
      }),
    },
    async ({ userId: rawUserId, fileId, star }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
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
        userId: userIdParam,
        fileId: z.string().describe("The file ID to download"),
      }),
    },
    async ({ userId: rawUserId, fileId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
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
