import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServices } from "../server";
import { logger } from "../../lib/logger";

export function registerFolderTools(
  server: McpServer,
  services: McpServices,
): void {
  const { folderService } = services;

  server.registerTool(
    "list_folder_contents",
    {
      description:
        "List the contents of a folder, including sub-folders and files. Use folderId='root' for the root directory.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        folderId: z
          .string()
          .describe("The folder ID. Use 'root' for the root directory."),
      }),
    },
    async ({ userId, folderId }) => {
      try {
        const content = await folderService.getFolderContent(
          folderId === "root" ? "" : folderId,
          userId,
        );
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
          { error: message, userId, folderId },
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
      description: "Create a new folder inside a parent folder.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        name: z.string().describe("The name of the new folder"),
        parentId: z
          .string()
          .optional()
          .describe(
            "The parent folder ID. Omit or use 'root' for root directory.",
          ),
      }),
    },
    async ({ userId, name, parentId }) => {
      try {
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
      description: "Rename an existing folder.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        folderId: z.string().describe("The folder ID to rename"),
        newName: z.string().describe("The new name for the folder"),
      }),
    },
    async ({ userId, folderId, newName }) => {
      try {
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
      description: "Move a folder to a different parent folder.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        folderId: z.string().describe("The folder ID to move"),
        destinationId: z
          .string()
          .describe(
            "The destination folder ID. Use 'root' for root directory.",
          ),
      }),
    },
    async ({ userId, folderId, destinationId }) => {
      try {
        await folderService.moveFolder({
          userId,
          folderId,
          // TODO：这个处理逻辑会不会导致 Bug？
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
      description: "Move a folder and its contents to the trash.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        folderId: z.string().describe("The folder ID to trash"),
      }),
    },
    async ({ userId, folderId }) => {
      try {
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
      description: "Restore a folder from the trash.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        folderId: z.string().describe("The folder ID to restore"),
      }),
    },
    async ({ userId, folderId }) => {
      try {
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
        "Permanently delete a folder and all its contents. This action cannot be undone.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        folderId: z.string().describe("The folder ID to permanently delete"),
      }),
    },
    async ({ userId, folderId }) => {
      try {
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
        "Get the breadcrumb path for a folder, showing its position in the folder hierarchy.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        folderId: z.string().describe("The folder ID to get the path for"),
      }),
    },
    async ({ userId, folderId }) => {
      try {
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
      description: "Star or unstar a folder.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        folderId: z.string().describe("The folder ID"),
        star: z
          .boolean()
          .describe("Whether to star (true) or unstar (false) the folder"),
      }),
    },
    async ({ userId, folderId, star }) => {
      try {
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
