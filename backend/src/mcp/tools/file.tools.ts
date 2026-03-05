// 文件相关操作 — Smart Tool 模式
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServices } from "../server";
import { McpAuthContext, resolveUserId } from "../auth/auth";
import { logger } from "../../lib/logger";

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
        "List all files for the authenticated user. Returns file metadata including name, size, type, and timestamps. " +
        "WHEN TO USE: When the user wants to see all their files, or filter by starred/trashed/recent. " +
        "WHEN NOT TO USE: When looking for a specific file by name (use search_files) or by content (use semantic_search_files). " +
        "NOTES: Use the filter parameter to narrow results. For folder contents, use list_folder_contents instead.",
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
        "Get detailed metadata about a specific file (name, size, mimeType, timestamps, permissions). " +
        "WHEN TO USE: When you need file metadata (size, type, dates) and already have the file ID. " +
        "WHEN NOT TO USE: When you need the file's text content (use extract_file_content instead). " +
        "NOTES: Returns metadata only, NOT file content. If a resource URI already provides this info, do not call this.",
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
        "Automatically handles text files (.txt, .md, .json, .ts, .py, etc.), PDF (.pdf), and Word (.docx). " +
        "WHEN TO USE: When you have a specific file ID and need to read its content. " +
        "WHEN NOT TO USE: When searching for content across many files (use semantic_search_files). " +
        "Also skip this if a drive://files/{fileId} resource already provides the content. " +
        "NOTES: Content auto-truncated at 100KB. For binary files (images, videos), use get_download_url.",
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
        "Overwrite the entire text content of an existing file. " +
        "WHEN TO USE: Only when you need a complete content replacement (rare). " +
        "WHEN NOT TO USE: For targeted edits — use patch_file instead (safer, non-destructive). " +
        "NOTES: Only works for text-based files. Prefer patch_file for all editing scenarios.",
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
        "Create a new file in the user's drive, optionally with initial text content. " +
        "Supports txt, md, docx, xlsx, pptx, and other formats. " +
        "WHEN TO USE: When the user asks to create a new document or file. Pass content param to write initial text in one step. " +
        "WHEN NOT TO USE: When editing an existing file (use patch_file or write_file). " +
        "NOTES: Combine creation and writing into a single call by using the content parameter.",
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
      description:
        "Rename an existing file. " +
        "WHEN TO USE: When the user wants to change a file's name. " +
        "WHEN NOT TO USE: For moving files to another folder (use move_file). " +
        "NOTES: Does not change the file's location or content.",
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
      description:
        "Move a file to a different folder. " +
        "WHEN TO USE: When the user wants to reorganize files between folders. " +
        "WHEN NOT TO USE: For renaming (use rename_file) or deleting (use trash_file). " +
        "NOTES: Use 'root' as destinationFolderId for the root directory.",
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
      description:
        "Move a file to the trash. The file can be restored later. " +
        "WHEN TO USE: When the user wants to delete a file (soft delete). " +
        "WHEN NOT TO USE: For permanent deletion (use delete_file). " +
        "NOTES: Requires user approval. File can be restored with restore_file.",
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
      description:
        "Restore a file from the trash back to its original location. " +
        "WHEN TO USE: When the user wants to recover a previously trashed file. " +
        "WHEN NOT TO USE: File is not in trash. " +
        "NOTES: Only works on trashed files.",
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
      description:
        "Permanently delete a file. This action cannot be undone. " +
        "WHEN TO USE: Only when the user explicitly requests permanent deletion. " +
        "WHEN NOT TO USE: For soft delete (use trash_file instead). " +
        "NOTES: Irreversible. Requires user approval.",
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
      description:
        "Star or unstar a file to mark it as important. " +
        "WHEN TO USE: When the user wants to bookmark/favorite a file. " +
        "WHEN NOT TO USE: For folders (use star_folder). " +
        "NOTES: Pass star=true to star, star=false to unstar.",
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
        "Get a presigned download URL for a file. Valid for a limited time. " +
        "WHEN TO USE: When the user needs to download a file, or for binary files (images, videos) that cannot be read as text. " +
        "WHEN NOT TO USE: When you need to read the file's text content (use extract_file_content). " +
        "NOTES: Returns a time-limited URL. For text extraction, always prefer extract_file_content.",
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

  server.registerTool(
    "batch_extract_file_contents",
    {
      description:
        "## Core Action\n" +
        "Extract text content from MULTIPLE files in a single call.\n\n" +
        "## WHEN TO USE\n" +
        "- When you need to read 2+ files' content at once (e.g., to compare, summarize, or use as reference for writing)\n" +
        "- When a task plan step says 'read files A, B, C' — call this ONCE instead of calling extract_file_content multiple times\n" +
        "- Example: 'Read report.pdf and budget.xlsx to prepare a comparison'\n\n" +
        "## WHEN NOT TO USE\n" +
        "- For a single file — use extract_file_content instead\n" +
        "- For summarizing a whole folder — use map_reduce_summarize with a drive://folders/ URI\n" +
        "- When file content is already in context via @ resource attachments\n\n" +
        "## NOTES\n" +
        "- Returns all file contents concatenated in Markdown format with file name headings\n" +
        "- Automatically truncates if total output exceeds 30,000 characters\n" +
        "- Files that fail extraction are reported inline without blocking others\n" +
        "- Binary files (images, videos) are skipped with a note",
      inputSchema: z.object({
        userId: userIdParam,
        fileIds: z
          .array(z.string())
          .min(1)
          .max(20)
          .describe("Array of file IDs to extract content from (1-20 files)"),
      }),
    },
    async ({ userId: rawUserId, fileIds }) => {
      const BATCH_MAX_CHARS = 30_000;
      const CONCURRENCY = 10;

      try {
        const userId = resolveUserId(rawUserId, authContext);

        // Simple concurrency limiter
        let active = 0;
        const queue: Array<() => void> = [];
        function next() {
          if (queue.length > 0 && active < CONCURRENCY) {
            active++;
            queue.shift()!();
          }
        }
        function limit<T>(fn: () => Promise<T>): Promise<T> {
          return new Promise<T>((resolve, reject) => {
            queue.push(() => {
              fn()
                .then(resolve, reject)
                .finally(() => {
                  active--;
                  next();
                });
            });
            next();
          });
        }

        const results = await Promise.all(
          fileIds.map((fileId) =>
            limit(async () => {
              try {
                const { text, file } =
                  await knowledgeService.extractFileContent(fileId, userId);
                return {
                  fileId,
                  name: file.name || fileId,
                  content: text,
                  success: true as const,
                };
              } catch (err) {
                return {
                  fileId,
                  name: fileId,
                  content: `(Extraction failed: ${err instanceof Error ? err.message : "Unknown error"})`,
                  success: false as const,
                };
              }
            }),
          ),
        );

        // Build Markdown output with file name headings
        const parts: string[] = [];
        let totalChars = 0;
        let truncated = false;
        let includedCount = 0;

        for (const r of results) {
          const section = `## ${r.name}\n\n${r.content}\n`;
          if (totalChars + section.length > BATCH_MAX_CHARS) {
            truncated = true;
            // Include as much as possible
            const remaining = BATCH_MAX_CHARS - totalChars;
            if (remaining > 200) {
              parts.push(section.slice(0, remaining) + "\n\n[...truncated]");
              includedCount++;
            }
            break;
          }
          parts.push(section);
          totalChars += section.length;
          includedCount++;
        }

        let output = parts.join("\n---\n\n");

        if (truncated) {
          output +=
            `\n\n---\n**⚠️ Warning: Results truncated** (${includedCount}/${results.length} files included, ${totalChars} chars). ` +
            `Use \`map_reduce_summarize\` for larger batches.`;
        }

        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;

        logger.info(
          {
            requestedFiles: fileIds.length,
            successCount,
            failCount,
            totalChars,
            truncated,
          },
          "MCP batch_extract_file_contents completed",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: output,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { error: message, fileIds },
          "MCP batch_extract_file_contents failed",
        );
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
