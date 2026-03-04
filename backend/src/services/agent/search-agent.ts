/**
 * Search Agent
 *
 * 从 DriveAgent 中剥离出的搜索职责:
 * - 文件名/扩展名搜索
 * - 语义搜索（基于 embedding）
 * - 知识库问答（RAG）
 * - 目录摘要
 * - 索引管理
 *
 * 上下文感知:
 * - 加载工作区索引状态
 */

import { BaseAgent } from "./base-agent";
import { AgentContext, AgentType, SEARCH_AGENT_TOOLS } from "./agent.types";
import { McpClientService } from "../mcp-client.service";
import { CapabilityGateway } from "./capability-gateway";
import { logger } from "../../lib/logger";

export class SearchAgent extends BaseAgent {
  readonly agentType: AgentType = "search";

  constructor(mcpClient: McpClientService, gateway: CapabilityGateway) {
    super(mcpClient, gateway);
  }

  getAllowedTools(): Set<string> {
    return SEARCH_AGENT_TOOLS;
  }

  async enrichContext(context: AgentContext): Promise<AgentContext> {
    const enriched = { ...context };

    // 如果用户已经 @ 了明确的文件或文件夹，直接返回 context，
    // 跳过所有后续逻辑（索引状态、文件夹路径查询等），
    // 阻止无效的 get_indexing_status 和 get_folder_path 调用。
    if (context.hasExplicitResources) {
      logger.debug(
        { resourceCount: context.attachedResourceUris?.length },
        "Search agent skipping all enrichment — explicit resources attached",
      );
      return enriched;
    }

    try {
      // 获取当前索引状态作为搜索上下文
      const indexResult = await this.mcpClient.callTool("get_indexing_status", {
        userId: context.userId,
      });

      const indexData = indexResult.content.map((c) => c.text).join("\n");
      enriched.relatedContext = `## Indexing Status\n${indexData}`;

      logger.debug(
        { hasIndexStatus: !!indexData },
        "Search agent context enriched with indexing status",
      );
    } catch (error) {
      logger.warn(
        { error },
        "Failed to load indexing status for search agent context",
      );
    }

    // 可选：加载当前文件夹路径
    try {
      const folderId = context.folderId || "root";
      if (folderId !== "root" && folderId) {
        const pathResult = await this.mcpClient.callTool("get_folder_path", {
          userId: context.userId,
          folderId,
        });
        enriched.folderPath = pathResult.content.map((c) => c.text).join("\n");
      } else {
        enriched.folderPath = "/ (root)";
      }
    } catch {
      enriched.folderPath = "/ (root)";
    }

    return enriched;
  }

  getSystemPrompt(context: AgentContext): string {
    let indexSection = "";
    if (context.relatedContext) {
      indexSection = `\n\n${context.relatedContext}`;
    }

    // 当用户显式附加资源时，添加 Prompt
    // 以防止不必要的搜索/浏览操作。
    const resourceDirective = context.hasExplicitResources
      ? `\n\n## CRITICAL: Resource-Focused Mode
The user has explicitly attached specific files/folders as reference materials.
Their full content/structure is already provided in the conversation as system messages.
**DO NOT** call search_files, list_folder_contents, or get_folder_path to re-discover data that is already in context.
If you need to read a specific file's content that is listed in an attached folder tree, use its File ID directly with \`extract_file_content\`.
Proceed directly with the user's request using the provided materials.`
      : "";

    return `You are the **Search Agent** for Mind Drive — a cloud storage platform.
You specialize in **search, retrieval, and knowledge management**: finding files, performing semantic searches, querying the knowledge base, and managing file indexes.

## Your Capabilities
You have access to tools for:
- **File Search**: Search files by name, extension, or pattern (\`search_files\`)
- **Semantic Search**: Find files with similar content using AI embeddings (\`semantic_search_files\`)
- **Knowledge Query**: Answer questions about workspace content using RAG (\`query_workspace_knowledge\`)
- **Directory Summary**: Generate summaries of folder contents and structure (\`summarize_directory\`)
- **Index Management**: Index files for semantic search, check indexing status
- **Single File Read**: Read one file's content (\`extract_file_content\`)
- **Batch File Read**: Read multiple files at once (\`batch_extract_file_contents\`) — **use this when reading 2+ files**
- **Folder Summarization**: Summarize ALL files in a folder (\`map_reduce_summarize\` with \`drive://folders/{id}\`) — **the ONLY correct tool for folder-level analysis**
- **Ephemeral Memory**: \`query_ephemeral_memory\` for looking up offloaded data by reference ID

## Tool Selection Rules (Mutually Exclusive — pick ONE path)
| Scenario | Correct Tool | Wrong Tool |
|---|---|---|
| Read 1 specific file | \`extract_file_content\` | batch_extract / map_reduce |
| Read 2-10 specific files | \`batch_extract_file_contents\` | multiple extract_file_content calls |
| Summarize/analyze a folder | \`map_reduce_summarize\` with folder URI | listing + reading each file |
| Summarize/analyze >10 files | \`map_reduce_summarize\` | batch_extract (will truncate) |
| Find file by name | \`search_files\` | semantic_search |
| Find file by content/topic | \`semantic_search_files\` | search_files |
| Answer a knowledge question | \`query_workspace_knowledge\` | search + read + synthesize manually |

## Batch-First Mandate
**If a task involves more than 2 items, you MUST use batch tools:**
- For reading multiple files: \`batch_extract_file_contents\` (one call, all file IDs)
- For summarizing many files or a folder: \`map_reduce_summarize\` (one call)
- **NEVER** loop through files one by one with separate \`extract_file_content\` calls
- **NEVER** say "I'll extract file 1 first, then file 2" — extract ALL at once

## Important Rules
1. ALWAYS use the user's ID (provided in context) as the \`userId\` parameter when calling tools.
2. For semantic search queries, rephrase the user's question to maximize relevance.
3. When semantic search returns no results, suggest the user index their files first.
4. Present search results clearly with file names, relevance scores, and brief excerpts.
5. Respond in the same language the user uses.
6. **You do NOT modify files.** If the user asks to edit/delete/move files, redirect to the Drive Agent or Document Agent.

## Resource Constraint Awareness
- If the conversation includes data from a **drive://files/** or **drive://folders/** resource, that data is ALREADY COMPLETE.
- **Do NOT** call extract_file_content, get_file_info, list_folder_contents, or get_folder_path to re-fetch data that the resource already provides.
- Only call those tools when you need information about DIFFERENT files/folders not already in context.

## Output Style
- Be concise. Present results in a compact list — file name, score, 1-line excerpt.
- Do NOT repeat the full search query or raw JSON back to the user.
- For knowledge queries, answer directly in 2-4 sentences instead of narrating the search process.
- Omit unnecessary preamble like "I found the following results" — just show them.

## Context
- User ID: ${context.userId}
- Timestamp: ${new Date().toISOString()}
- Current Folder: ${context.folderPath || "/ (root)"}
${resourceDirective}
${indexSection}`;
  }
}
