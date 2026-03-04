import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServices } from "../server";
import { McpAuthContext, resolveUserId } from "../auth/auth";
import { logger } from "../../lib/logger";

const userIdParam = z
  .string()
  .optional()
  .describe("The user ID. Optional if authenticated via 'authenticate' tool.");

export function registerFolderTools(
  server: McpServer,
  services: McpServices,
  authContext: McpAuthContext,
): void {
  const { folderService } = services;

  server.registerTool(
    "list_folder_contents",
    {
      description:
        "List direct children (sub-folders and files) of a specific folder. " +
        "WHEN TO USE: When the user asks 'what's in this folder' or you need to enumerate folder contents by ID. " +
        "WHEN NOT TO USE: When a drive://folders/{folderId} resource already provides this data. For aggregate stats, use summarize_directory instead. " +
        "NOTES: Use folderId='root' for root directory. Returns immediate children only, not recursive.",
      inputSchema: z.object({
        userId: userIdParam,
        folderId: z
          .string()
          .describe("The folder ID. Use 'root' for the root directory."),
      }),
    },
    async ({ userId: rawUserId, folderId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        const content = await folderService.getFolderContent(folderId, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  currentFolder: content.currentFolder
                    ? {
                        id: content.currentFolder.id,
                        name: content.currentFolder.name,
                      }
                    : { id: "root", name: "My Drive" },
                  folders: content.folders.map((f) => ({
                    id: f.id,
                    name: f.name,
                    isStarred: f.isStarred,
                    createdAt: f.createdAt,
                    updatedAt: f.updatedAt,
                  })),
                  files: content.files.map((f) => ({
                    id: f.id,
                    name: f.name,
                    size: f.size,
                    mimeType: f.mimeType,
                    isStarred: f.isStarred,
                    createdAt: f.createdAt,
                    updatedAt: f.updatedAt,
                  })),
                  totalItems: content.folders.length + content.files.length,
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
          { error: message, rawUserId, folderId },
          "MCP list_folder_contents failed",
        );
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "create_folder",
    {
      description:
        "Create a new empty folder inside a parent folder. " +
        "WHEN TO USE: When the user asks to create a new folder. " +
        "WHEN NOT TO USE: For creating files (use create_file). " +
        "NOTES: Use parentId='root' or omit for root directory.",
      inputSchema: z.object({
        userId: userIdParam,
        name: z.string().describe("The name of the new folder"),
        parentId: z
          .string()
          .optional()
          .describe(
            "The parent folder ID. Omit or use 'root' for root directory.",
          ),
      }),
    },
    async ({ userId: rawUserId, name, parentId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        const folder = await folderService.createFolder({
          userId,
          name,
          parentId: parentId === "root" || !parentId ? undefined : parentId,
        } as any);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  folder: {
                    id: folder.id,
                    name: folder.name,
                    createdAt: folder.createdAt,
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
    "rename_folder",
    {
      description:
        "Rename an existing folder. " +
        "WHEN TO USE: When the user wants to change a folder's name. " +
        "WHEN NOT TO USE: For moving (use move_folder) or deleting (use trash_folder). " +
        "NOTES: Does not change the folder's location.",
      inputSchema: z.object({
        userId: userIdParam,
        folderId: z.string().describe("The folder ID to rename"),
        newName: z.string().describe("The new name for the folder"),
      }),
    },
    async ({ userId: rawUserId, folderId, newName }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        await folderService.renameFolder(folderId, userId, newName);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                folderId,
                newName,
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
    "move_folder",
    {
      description:
        "Move a folder to a different parent folder. " +
        "WHEN TO USE: When the user wants to reorganize folders. " +
        "WHEN NOT TO USE: For renaming (use rename_folder). " +
        "NOTES: Use 'root' as destinationId for root directory.",
      inputSchema: z.object({
        userId: userIdParam,
        folderId: z.string().describe("The folder ID to move"),
        destinationId: z
          .string()
          .describe(
            "The destination folder ID. Use 'root' for root directory.",
          ),
      }),
    },
    async ({ userId: rawUserId, folderId, destinationId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        await folderService.moveFolder({
          userId,
          folderId,
          destinationId: destinationId === "root" ? undefined : destinationId,
        } as any);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                folderId,
                destinationId,
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
    "trash_folder",
    {
      description:
        "Move a folder and all its contents to the trash (soft delete). " +
        "WHEN TO USE: When the user wants to delete a folder. " +
        "WHEN NOT TO USE: For permanent deletion (use delete_folder). " +
        "NOTES: Requires user approval. Can be restored with restore_folder.",
      inputSchema: z.object({
        userId: userIdParam,
        folderId: z.string().describe("The folder ID to trash"),
      }),
    },
    async ({ userId: rawUserId, folderId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        await folderService.trashFolder(folderId, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                folderId,
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
    "restore_folder",
    {
      description:
        "Restore a folder from the trash back to its original location. " +
        "WHEN TO USE: When the user wants to recover a trashed folder. " +
        "WHEN NOT TO USE: Folder is not in trash. " +
        "NOTES: Only works on trashed folders.",
      inputSchema: z.object({
        userId: userIdParam,
        folderId: z.string().describe("The folder ID to restore"),
      }),
    },
    async ({ userId: rawUserId, folderId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        await folderService.restoreFolder(folderId, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                folderId,
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
    "delete_folder",
    {
      description:
        "Permanently delete a folder and ALL its contents. This cannot be undone. " +
        "WHEN TO USE: Only when the user explicitly requests permanent deletion. " +
        "WHEN NOT TO USE: For soft delete (use trash_folder). " +
        "NOTES: Irreversible. Requires user approval. Deletes all sub-folders and files.",
      inputSchema: z.object({
        userId: userIdParam,
        folderId: z.string().describe("The folder ID to permanently delete"),
      }),
    },
    async ({ userId: rawUserId, folderId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        await folderService.deleteFolderPermanent(folderId, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                folderId,
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
    "get_folder_path",
    {
      description:
        "Get the breadcrumb path for a folder (e.g., 'Root / Projects / CS224n'). " +
        "WHEN TO USE: When you need to display a folder's position in the folder hierarchy. " +
        "WHEN NOT TO USE: When a drive://folders/{folderId} resource already includes the path. " +
        "NOTES: Returns an array of {id, name} path segments.",
      inputSchema: z.object({
        userId: userIdParam,
        folderId: z.string().describe("The folder ID to get the path for"),
      }),
    },
    async ({ userId: rawUserId, folderId }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        const path = await folderService.getFolderPath(folderId, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  path: path.map((p) => ({ id: p.id, name: p.name })),
                  fullPath: path.map((p) => p.name).join("/"),
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
    "star_folder",
    {
      description:
        "Star or unstar a folder to mark it as important. " +
        "WHEN TO USE: When the user wants to bookmark/favorite a folder. " +
        "WHEN NOT TO USE: For files (use star_file). " +
        "NOTES: Pass star=true to star, star=false to unstar.",
      inputSchema: z.object({
        userId: userIdParam,
        folderId: z.string().describe("The folder ID"),
        star: z
          .boolean()
          .describe("Whether to star (true) or unstar (false) the folder"),
      }),
    },
    async ({ userId: rawUserId, folderId, star }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);
        await folderService.starFolder(folderId, userId, star);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                folderId,
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
}
