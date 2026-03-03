/**
 * drive:// URI 动态资源
 *
 * 允许 MCP Client 通过 resources/read 协议读取
 * 文件内容和文件夹结构。
 *
 * 资源模板：
 *   drive://files/{fileId}     — 提取并返回文件内容
 *   drive://folders/{folderId} — 以 Markdown 格式返回文件夹树结构
 *
 * 驱动 File Attach 功能：
 * - 提及文件 时，drive://files/{id} 内容作为上下文注入
 * - 提及文件夹 时，drive://folders/{id} 提供完整的目录树
 */

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "../server";
import { logger } from "../../lib/logger";
import File from "../../models/File.model";
import Folder from "../../models/Folder.model";
import { isTextExtractable } from "../../services/knowledge.service";

interface TreeItem {
  name: string;
  type: "file" | "folder";
  size?: number;
  mimeType?: string;
  id: string;
  children?: TreeItem[];
}

async function buildFolderTree(
  folderId: string,
  userId: string,
  folderService: McpServices["folderService"],
  depth: number = 0,
  maxDepth: number = 5,
): Promise<TreeItem[]> {
  if (depth >= maxDepth) {
    return [{ name: "... (max depth reached)", type: "folder", id: "" }];
  }

  const content = await folderService.getFolderContent(folderId, userId);
  const items: TreeItem[] = [];

  // 迭代添加子目录
  for (const folder of content.folders) {
    const children = await buildFolderTree(
      folder.id,
      userId,
      folderService,
      depth + 1,
      maxDepth,
    );
    items.push({
      name: folder.name,
      type: "folder",
      id: folder.id,
      children,
    });
  }

  for (const file of content.files) {
    items.push({
      name: file.name,
      type: "file",
      size: file.size,
      mimeType: file.mimeType,
      id: file.id,
    });
  }

  return items;
}

function renderTreeMarkdown(items: TreeItem[], indent: string = ""): string {
  const lines: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLast = i === items.length - 1;
    const prefix = indent + (isLast ? "└── " : "├── ");
    const childIndent = indent + (isLast ? "    " : "│   ");

    if (item.type === "folder") {
      lines.push(`${prefix}📁 ${item.name}/`);
      if (item.children && item.children.length > 0) {
        lines.push(renderTreeMarkdown(item.children, childIndent));
      }
    } else {
      const sizeStr = item.size ? ` (${formatBytes(item.size)})` : "";
      lines.push(`${prefix}📄 ${item.name}${sizeStr}`);
    }
  }
  return lines.join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function registerDriveResources(
  server: McpServer,
  services: McpServices,
): void {
  const { folderService } = services;
  const knowledgeService = services.knowledgeService;

  // drive://files/{fileId}
  server.registerResource(
    "drive-file",
    new ResourceTemplate("drive://files/{fileId}", {
      list: async () => {
        // 文件不需要 list
        return { resources: [] };
      },
    }),
    {
      title: "Drive File Content",
      description:
        "Read the content of a file from the drive. Automatically handles " +
        "text files, PDF, and DOCX formats. Use drive://files/{fileId} to " +
        "inject file content as context for AI conversations.",
      mimeType: "text/plain",
    },
    async (uri, variables) => {
      const fileId = variables.fileId as string;

      try {
        const file = await File.findById(fileId);
        if (!file) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "text/plain",
                text: `[Error: File not found (id: ${fileId})]`,
              },
            ],
          };
        }

        if (!isTextExtractable(file.mimeType)) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify(
                  {
                    error: "binary_file",
                    message: `Cannot extract text from ${file.mimeType}. This is a binary file (e.g., image, video).`,
                    file: {
                      id: file._id.toString(),
                      name: file.name,
                      size: file.size,
                      mimeType: file.mimeType,
                    },
                    suggestion:
                      "Use the 'get_download_url' tool to get a download link for this file.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const userId = file.user.toString();
        const { text, extractionMethod } =
          await knowledgeService.extractFileContent(fileId, userId);

        // 根据上下文窗口进行裁剪
        // TODO：可以用 Summary 或者更智能的裁剪方式
        const MAX_RESOURCE_CHARS = 200_000;
        let content = text;
        let truncated = false;
        if (content.length > MAX_RESOURCE_CHARS) {
          content = content.slice(0, MAX_RESOURCE_CHARS);
          truncated = true;
        }

        const header =
          `# ${file.name}\n` +
          `> File ID: ${fileId} | Type: ${file.mimeType} | Size: ${formatBytes(file.size)} | ` +
          `Extraction: ${extractionMethod}` +
          (truncated
            ? ` | ⚠️ TRUNCATED (${formatBytes(text.length)} → ${formatBytes(MAX_RESOURCE_CHARS)})`
            : "") +
          `\n\n`;

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: header + content,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { err: error, fileId },
          "Failed to read drive://files resource",
        );
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `[Error reading file: ${message}]`,
            },
          ],
        };
      }
    },
  );

  // drive://folders/{folderId}
  server.registerResource(
    "drive-folder",
    new ResourceTemplate("drive://folders/{folderId}", {
      list: async () => {
        // 文件夹资源不需要 list，客户端通过 search/list 工具获取 folderId 后直接读取
        return { resources: [] };
      },
    }),
    {
      title: "Drive Folder Structure",
      description:
        "Read the directory structure of a folder from the drive. " +
        "Returns a Markdown-formatted file tree with file names, sizes, and types. " +
        "Use drive://folders/{folderId} to inject folder context for AI conversations. " +
        "Use 'root' as folderId for the root directory.",
      mimeType: "text/plain",
    },
    async (uri, variables) => {
      const folderId = variables.folderId as string;

      try {
        let folderName = "My Drive";
        if (folderId !== "root") {
          const folder = await Folder.findById(folderId);
          if (!folder) {
            return {
              contents: [
                {
                  uri: uri.href,
                  mimeType: "text/plain",
                  text: `[Error: Folder not found (id: ${folderId})]`,
                },
              ],
            };
          }
          folderName = folder.name;
        }

        let userId: string;
        if (folderId !== "root") {
          const folder = await Folder.findById(folderId);
          userId = folder!.user.toString();
        } else {
          // 找任意一个目录的 userId 作为 root 的 userId
          const anyFolder = await Folder.findOne({
            parent: null,
          });
          const anyFile = await File.findOne({ folder: null });
          userId = anyFolder?.user.toString() || anyFile?.user.toString() || "";
          if (!userId) {
            return {
              contents: [
                {
                  uri: uri.href,
                  mimeType: "text/plain",
                  text: "[Error: Cannot determine user for root folder. Use a specific folder ID instead.]",
                },
              ],
            };
          }
        }

        const treeItems = await buildFolderTree(
          folderId,
          userId,
          folderService,
          0,
          5,
        );

        const content = await folderService.getFolderContent(folderId, userId);
        const totalFiles = content.files.length;
        const totalFolders = content.folders.length;
        const totalSize = content.files.reduce((sum, f) => sum + f.size, 0);

        const header =
          `# 📁 ${folderName}\n` +
          `> Folder ID: ${folderId} | ${totalFolders} folders, ${totalFiles} files | ` +
          `Total size: ${formatBytes(totalSize)}\n\n`;

        const tree =
          treeItems.length > 0
            ? "```\n" + renderTreeMarkdown(treeItems) + "\n```"
            : "(empty folder)";

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: header + tree,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { err: error, folderId },
          "Failed to read drive://folders resource",
        );
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `[Error reading folder: ${message}]`,
            },
          ],
        };
      }
    },
  );

  logger.info(
    "Dynamic drive resources registered: drive://files/{fileId}, drive://folders/{folderId}",
  );
}
