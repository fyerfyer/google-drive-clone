// 给并发调用返回的结果使用
// 消费被临时存储的大量上下文
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServices } from "../server";
import { McpAuthContext, resolveUserId } from "../auth/auth";
import { logger } from "../../lib/logger";
import { config } from "../../config/env";
import { isTextExtractable } from "../../services/knowledge.service";
import {
  getEphemeral,
  queryEphemeralByLabel,
  getEphemeralChunks,
  storeEphemeral,
  FILE_EXTRACTION_CONCURRENCY,
  MAP_REDUCE_LLM_CONCURRENCY,
  EphemeralItem,
} from "../../services/agent/ephemeral-store";
import pLimit from "p-limit";

const userIdParam = z
  .string()
  .optional()
  .describe("The user ID. Optional if authenticated via 'authenticate' tool.");

async function callLlmForMapReduce(
  systemPrompt: string,
  userContent: string,
  maxTokens: number = 1000,
): Promise<string> {
  const apiKey = config.llmApiKey;
  const baseUrl = config.llmBaseUrl;
  const model = config.llmModel;

  if (!apiKey) throw new Error("LLM not configured");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices?.[0]?.message?.content?.trim() || "(no response)";
}

export function registerEphemeralTools(
  server: McpServer,
  services: McpServices,
  _authContext: McpAuthContext,
): void {
  server.registerTool(
    "query_ephemeral_memory",
    {
      description:
        "## Core Action\n" +
        "Retrieve specific data from a temporary context store using a Reference ID.\n\n" +
        "## WHEN TO USE\n" +
        "- When a previous step returned a Reference ID (e.g., `eph_xxxx`) instead of full data\n" +
        "- When you need to look up specific items by label from offloaded batch results\n" +
        "- Example: 'The previous step offloaded 8 file contents to eph_abc123. Query for the budget report.'\n\n" +
        "## WHEN NOT TO USE\n" +
        "- When data is already available in your context (no Reference ID present)\n" +
        "- When you need a full summary of ALL items — use 'map_reduce_summarize' instead\n\n" +
        "## NOTES\n" +
        "- Returns matching items by label substring match, or full metadata if no query given\n" +
        "- Ephemeral data expires after ~10 minutes\n" +
        "- Each item includes label, content snippet, and metadata",
      inputSchema: z.object({
        userId: userIdParam,
        referenceId: z
          .string()
          .describe("The ephemeral Reference ID (e.g., 'eph_abc123def4')"),
        query: z
          .string()
          .optional()
          .describe(
            "Optional label query to filter specific items (e.g., file name, step title)",
          ),
      }),
    },
    async ({ referenceId, query }) => {
      try {
        if (query) {
          const items = queryEphemeralByLabel(referenceId, query);
          if (items.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    referenceId,
                    query,
                    matchCount: 0,
                    message:
                      "No items matched the query. Try a broader search term or use map_reduce_summarize for a full summary.",
                  }),
                },
              ],
            };
          }

          const MAX_QUERY_RESULT_CHARS = 30_000;
          let totalChars = 0;
          const truncatedItems = [];
          for (const item of items) {
            const itemChars = item.content.length + item.label.length;
            if (totalChars + itemChars > MAX_QUERY_RESULT_CHARS) {
              truncatedItems.push({
                label: item.label,
                content:
                  item.content.slice(0, MAX_QUERY_RESULT_CHARS - totalChars) +
                  "\n[...truncated]",
                meta: item.meta,
              });
              break;
            }
            truncatedItems.push(item);
            totalChars += itemChars;
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    referenceId,
                    query,
                    matchCount: items.length,
                    items: truncatedItems,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // 只返回 metadata
        const entry = getEphemeral(referenceId);
        if (!entry) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "not_found",
                  referenceId,
                  message:
                    "Ephemeral data not found or expired. It may have been cleaned up after ~10 minutes.",
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  referenceId,
                  metadata: entry.metadata,
                  itemLabels: entry.items?.map((i) => i.label) || [],
                  message:
                    "Use the 'query' parameter to retrieve specific items by label, or use 'map_reduce_summarize' for a full summary.",
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
          { error: message, referenceId },
          "MCP query_ephemeral_memory failed",
        );
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "map_reduce_summarize",
    {
      description:
        "## Core Action\n" +
        "Summarize large volumes of data using an internal Map-Reduce process with built-in concurrency.\n" +
        "The backend handles ALL chunking, parallel LLM calls, and result merging — this is a BLACK-BOX batch processor.\n\n" +
        "## Supported Inputs\n" +
        "- **Folder URI** (e.g., `drive://folders/{folderId}`) — fetches and summarizes ALL files in the folder automatically\n" +
        "- **Ephemeral Reference ID** (e.g., `eph_xxxx`) — summarizes data from a previous offloaded step\n\n" +
        "## WHEN TO USE (MANDATORY for these cases)\n" +
        "- **Summarizing a folder**: Pass `drive://folders/{folderId}` directly — this is the ONLY correct tool for 'summarize this folder' requests\n" +
        "- **Batch analysis of many files (>3)**: When you need to analyze/summarize more than 3 files at once\n" +
        "- **Processing large offloaded data**: When a previous step returned an ephemeral Reference ID (eph_xxxx)\n" +
        "- Examples:\n" +
        "  - 'Summarize all files in my reports folder' → use `drive://folders/{folderId}`\n" +
        "  - 'What are the key themes across these 10 documents?' → use this tool\n" +
        "  - 'Analyze the contents stored at eph_abc123' → use the ephemeral ID\n\n" +
        "## WHEN NOT TO USE\n" +
        "- When the data is small and already in your context window\n" +
        "- When you only need one specific item — use `query_ephemeral_memory` instead\n" +
        "- When reading ≤3 specific files — use `batch_extract_file_contents` instead\n\n" +
        "## NOTES\n" +
        "- Returns a concise summary (typically 200-500 words)\n" +
        "- Internally uses chunked parallelism — you do NOT need to manage concurrency yourself\n" +
        "- Custom instructions let you control what aspects to focus on\n" +
        "- For folder URIs, requires userId parameter",
      inputSchema: z.object({
        userId: userIdParam,
        referenceId: z
          .string()
          .describe(
            "The ephemeral Reference ID (eph_xxxx) or a drive://folders/{folderId} URI to summarize",
          ),
        instruction: z
          .string()
          .optional()
          .describe(
            "Custom summarization instruction (e.g., 'Focus on key findings and action items'). " +
              "Defaults to a general summary.",
          ),
      }),
    },
    async ({ userId: rawUserId, referenceId, instruction }) => {
      try {
        let chunks: string[];
        const folderMatch = referenceId.match(/^drive:\/\/folders\/(.+)$/);
        if (folderMatch) {
          const folderId = folderMatch[1];
          const userId = resolveUserId(rawUserId, _authContext);

          logger.info(
            { folderId, userId },
            "map_reduce_summarize: resolving folder URI to file contents",
          );

          const content = await services.folderService.getFolderContent(
            folderId,
            userId,
          );

          if (content.files.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    referenceId,
                    summary:
                      "(No files found in folder — nothing to summarize)",
                  }),
                },
              ],
            };
          }

          // 并发提取
          const limit = pLimit(FILE_EXTRACTION_CONCURRENCY);
          const extractableFiles = content.files.filter((f) =>
            isTextExtractable(f.mimeType),
          );

          if (extractableFiles.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    referenceId,
                    summary:
                      "(No text-extractable files in folder. Files may be images, videos, or other binary formats.)",
                    totalFiles: content.files.length,
                    skippedBinary: content.files.map((f) => ({
                      name: f.name,
                      mimeType: f.mimeType,
                    })),
                  }),
                },
              ],
            };
          }

          const extractionResults = await Promise.all(
            extractableFiles.map((file) =>
              limit(async () => {
                try {
                  const { text } =
                    await services.knowledgeService.extractFileContent(
                      file.id,
                      userId,
                    );
                  return {
                    label: file.name,
                    content: text,
                    meta: {
                      fileId: file.id,
                      mimeType: file.mimeType,
                      size: file.size,
                    },
                    success: true as const,
                  };
                } catch (err) {
                  logger.warn(
                    { fileId: file.id, fileName: file.name, err },
                    "map_reduce_summarize: failed to extract file content",
                  );
                  return {
                    label: file.name,
                    content: `(Failed to extract: ${err instanceof Error ? err.message : "Unknown error"})`,
                    meta: { fileId: file.id },
                    success: false as const,
                  };
                }
              }),
            ),
          );

          // 构建 ephemeral items 并存储
          const items: EphemeralItem[] = extractionResults.map((r) => ({
            label: r.label,
            content: r.content,
            meta: r.meta as Record<string, unknown>,
          }));

          const combinedData = items
            .map((i) => `### ${i.label}\n${i.content}`)
            .join("\n\n");

          const ephId = storeEphemeral(combinedData, items, {
            sourceType: "file_contents",
            itemCount: items.length,
            totalChars: combinedData.length,
            description: `File contents from folder ${folderId} (${extractableFiles.length} files)`,
          });

          logger.info(
            {
              ephemeralId: ephId,
              fileCount: extractableFiles.length,
              totalChars: combinedData.length,
            },
            "map_reduce_summarize: folder contents stored in ephemeral",
          );

          chunks = getEphemeralChunks(ephId);
        } else {
          chunks = getEphemeralChunks(referenceId);
        }

        if (chunks.length === 0) {
          const entry = getEphemeral(referenceId);
          if (!entry && !folderMatch) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "not_found",
                    referenceId,
                    message: "Ephemeral data not found or expired.",
                  }),
                },
              ],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  referenceId,
                  summary: "(No content to summarize — data appears empty)",
                }),
              },
            ],
          };
        }

        const mapInstruction =
          instruction ||
          "Summarize the key information, main points, and notable details.";

        const MAP_PROMPT = `You are a precise summarization assistant. Given a chunk of content from a larger dataset, extract and summarize the KEY information.
Focus on: ${mapInstruction}
Be concise but preserve important details, names, numbers, and specific facts.
Output a bullet-point summary. Maximum 200 words per chunk.`;

        const REDUCE_PROMPT = `You are a synthesis assistant. Given multiple partial summaries from different chunks of a large dataset, combine them into a single coherent summary.
Instructions: ${mapInstruction}
Remove duplicates, organize logically, and produce a clear final summary.
Maximum 500 words.`;

        logger.info(
          { referenceId, chunkCount: chunks.length },
          "Starting map-reduce summarization",
        );

        // Map
        const limit = pLimit(MAP_REDUCE_LLM_CONCURRENCY);
        const mapPromises = chunks.map((chunk, idx) =>
          limit(() =>
            callLlmForMapReduce(
              MAP_PROMPT,
              `[Chunk ${idx + 1} of ${chunks.length}]\n\n${chunk}`,
              800,
            ).catch((err) => {
              logger.warn({ err, chunk: idx + 1 }, "Map phase chunk failed");
              return `(Chunk ${idx + 1} processing failed)`;
            }),
          ),
        );

        const mapResults = await Promise.all(mapPromises);

        // Reduce
        const combinedMaps = mapResults
          .map((r, i) => `--- Chunk ${i + 1} Summary ---\n${r}`)
          .join("\n\n");

        let finalSummary: string;
        if (chunks.length === 1) {
          finalSummary = mapResults[0];
        } else {
          finalSummary = await callLlmForMapReduce(
            REDUCE_PROMPT,
            combinedMaps,
            1500,
          );
        }

        const meta = getEphemeral(referenceId)?.metadata;

        logger.info(
          {
            referenceId,
            chunkCount: chunks.length,
            summaryLength: finalSummary.length,
          },
          "Map-reduce summarization complete",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  referenceId,
                  summary: finalSummary,
                  metadata: meta
                    ? {
                        sourceType: meta.sourceType,
                        itemCount: meta.itemCount,
                        totalChars: meta.totalChars,
                        description: meta.description,
                      }
                    : undefined,
                  chunksProcessed: chunks.length,
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
          { error: message, referenceId },
          "MCP map_reduce_summarize failed",
        );
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
