import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServices } from "../server";
import { McpAuthContext, resolveUserId } from "../auth/auth";
import { logger } from "../../lib/logger";
import { getSocket } from "../../lib/socket";

const userIdParam = z
  .string()
  .optional()
  .describe("The user ID. Optional if authenticated via 'authenticate' tool.");

const patchOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("replace"),
    search: z.string().describe("Text to find (exact match)"),
    replace: z.string().describe("Text to replace with"),
  }),
  z.object({
    op: z.literal("insert_after"),
    search: z.string().describe("Text to find (insert after this)"),
    content: z.string().describe("Text to insert after the search text"),
  }),
  z.object({
    op: z.literal("insert_before"),
    search: z.string().describe("Text to find (insert before this)"),
    content: z.string().describe("Text to insert before the search text"),
  }),
  z.object({
    op: z.literal("append"),
    content: z.string().describe("Text to append to end of file"),
  }),
  z.object({
    op: z.literal("prepend"),
    content: z.string().describe("Text to prepend to beginning of file"),
  }),
  z.object({
    op: z.literal("delete"),
    search: z.string().describe("Text to find and remove"),
  }),
]);

function generateSimpleDiff(original: string, modified: string): string {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");

  const diffs: string[] = [];
  const maxLines = Math.max(origLines.length, modLines.length);

  for (let i = 0; i < maxLines; i++) {
    const origLine = origLines[i];
    const modLine = modLines[i];

    if (origLine === undefined && modLine !== undefined) {
      diffs.push(`+${i + 1}| ${modLine}`);
    } else if (origLine !== undefined && modLine === undefined) {
      diffs.push(`-${i + 1}| ${origLine}`);
    } else if (origLine !== modLine) {
      diffs.push(`-${i + 1}| ${origLine}`);
      diffs.push(`+${i + 1}| ${modLine}`);
    }
  }

  if (diffs.length === 0) return "(no changes)";
  if (diffs.length > 100) {
    return (
      diffs.slice(0, 100).join("\n") +
      `\n... (${diffs.length - 100} more lines)`
    );
  }
  return diffs.join("\n");
}

interface PatchOp {
  op: string;
  search?: string;
  replace?: string;
  content?: string;
}

function applyPatches(
  content: string,
  patches: PatchOp[],
): { newContent: string; applied: number; failed: number; details: string[] } {
  let result = content;
  let applied = 0;
  let failed = 0;
  const details: string[] = [];

  for (const patch of patches) {
    try {
      switch (patch.op) {
        case "replace": {
          if (!patch.search || patch.replace === undefined) {
            failed++;
            details.push(`replace: missing search or replace text`);
            break;
          }
          if (result.includes(patch.search)) {
            result = result.replace(patch.search, patch.replace);
            applied++;
            details.push(
              `replace: "${patch.search.slice(0, 50)}${patch.search.length > 50 ? "..." : ""}" → "${patch.replace.slice(0, 50)}${patch.replace.length > 50 ? "..." : ""}"`,
            );
          } else {
            failed++;
            details.push(
              `replace: search text not found: "${patch.search.slice(0, 80)}"`,
            );
          }
          break;
        }
        case "insert_after": {
          if (!patch.search || !patch.content) {
            failed++;
            details.push(`insert_after: missing search or content`);
            break;
          }
          const afterIdx = result.indexOf(patch.search);
          if (afterIdx >= 0) {
            const insertPos = afterIdx + patch.search.length;
            result =
              result.slice(0, insertPos) +
              patch.content +
              result.slice(insertPos);
            applied++;
            details.push(
              `insert_after: inserted ${patch.content.length} chars after "${patch.search.slice(0, 50)}"`,
            );
          } else {
            failed++;
            details.push(
              `insert_after: anchor text not found: "${patch.search.slice(0, 80)}"`,
            );
          }
          break;
        }
        case "insert_before": {
          if (!patch.search || !patch.content) {
            failed++;
            details.push(`insert_before: missing search or content`);
            break;
          }
          const beforeIdx = result.indexOf(patch.search);
          if (beforeIdx >= 0) {
            result =
              result.slice(0, beforeIdx) +
              patch.content +
              result.slice(beforeIdx);
            applied++;
            details.push(
              `insert_before: inserted ${patch.content.length} chars before "${patch.search.slice(0, 50)}"`,
            );
          } else {
            failed++;
            details.push(
              `insert_before: anchor text not found: "${patch.search.slice(0, 80)}"`,
            );
          }
          break;
        }
        case "append": {
          if (!patch.content) {
            failed++;
            details.push(`append: missing content`);
            break;
          }
          result = result + patch.content;
          applied++;
          details.push(`append: added ${patch.content.length} chars`);
          break;
        }
        case "prepend": {
          if (!patch.content) {
            failed++;
            details.push(`prepend: missing content`);
            break;
          }
          result = patch.content + result;
          applied++;
          details.push(`prepend: added ${patch.content.length} chars`);
          break;
        }
        case "delete": {
          if (!patch.search) {
            failed++;
            details.push(`delete: missing search text`);
            break;
          }
          if (result.includes(patch.search)) {
            result = result.replace(patch.search, "");
            applied++;
            details.push(
              `delete: removed "${patch.search.slice(0, 50)}${patch.search.length > 50 ? "..." : ""}"`,
            );
          } else {
            failed++;
            details.push(
              `delete: text not found: "${patch.search.slice(0, 80)}"`,
            );
          }
          break;
        }
        default:
          failed++;
          details.push(`unknown operation: ${patch.op}`);
      }
    } catch (err) {
      failed++;
      details.push(
        `${patch.op}: error — ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  return { newContent: result, applied, failed, details };
}

export function registerDocumentTools(
  server: McpServer,
  services: McpServices,
  authContext: McpAuthContext,
): void {
  const { fileService } = services;

  server.registerTool(
    "patch_file",
    {
      description:
        "Apply targeted patch operations to a document. Preferred over write_file for editing because it's non-destructive, auditable, and collaboration-safe. " +
        "Supports: replace, insert_after, insert_before, append, prepend, delete. " +
        "Each operation uses exact text matching to find the target location.",
      inputSchema: z.object({
        userId: userIdParam,
        fileId: z.string().describe("The file ID to patch"),
        patches: z
          .array(patchOpSchema)
          .min(1)
          .max(20)
          .describe("Array of patch operations to apply sequentially"),
      }),
    },
    async ({ userId: rawUserId, fileId, patches }) => {
      try {
        const userId = resolveUserId(rawUserId, authContext);

        // 获取当前文档内容
        const { content: originalContent, file } =
          await fileService.getFileContent({
            userId,
            fileId,
          });

        // Patch
        const { newContent, applied, failed, details } = applyPatches(
          originalContent,
          patches as PatchOp[],
        );

        if (applied === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    applied: 0,
                    failed,
                    details,
                    message:
                      "No patches could be applied. Check that search text matches exactly.",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        // 写回
        const updatedFile = await fileService.updateFileContent({
          userId,
          fileId,
          content: newContent,
        });

        const diff = generateSimpleDiff(originalContent, newContent);

        // 使用 WebSocket 广播文档更新事件
        try {
          const io = getSocket();
          io.to(`document:${fileId}`).emit("document:patched", {
            fileId,
            userId,
            patches,
            diff,
            timestamp: new Date().toISOString(),
            file: {
              id: updatedFile.id,
              name: updatedFile.name,
              size: updatedFile.size,
            },
          });
          logger.debug({ fileId }, "Document patch broadcast via WebSocket");
        } catch {
          // WebSocket broadcasting is best-effort
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  file: {
                    id: updatedFile.id,
                    name: updatedFile.name,
                    size: updatedFile.size,
                    updatedAt: updatedFile.updatedAt,
                  },
                  patchSummary: {
                    applied,
                    failed,
                    totalPatches: patches.length,
                    details,
                  },
                  diff,
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
        logger.error({ err: error, fileId }, "MCP patch_file failed");
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
