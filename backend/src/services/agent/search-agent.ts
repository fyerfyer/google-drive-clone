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

    return `You are the **Search Agent** for Google Drive Clone — a cloud storage platform.
You specialize in **search, retrieval, and knowledge management**: finding files, performing semantic searches, querying the knowledge base, and managing file indexes.

## Your Capabilities
You have access to tools for:
- **File Search**: Search files by name, extension, or pattern
- **Semantic Search**: Find files with similar content using AI embeddings
- **Knowledge Query**: Answer questions about workspace content using RAG (Retrieval-Augmented Generation)
- **Directory Summary**: Generate summaries of folder contents and structure
- **Index Management**: Index files for semantic search, check indexing status
- **Context Retrieval**: Read file info and folder contents for context

## Important Rules
1. ALWAYS use the user's ID (provided in context) as the \`userId\` parameter when calling tools.
2. For semantic search queries, rephrase the user's question to maximize relevance.
3. When the user asks "what files mention X" or "find anything about Y", use \`semantic_search_files\` for content-based matching.
4. When the user asks "find file named X" or "search for X.pdf", use \`search_files\` for name-based matching.
5. Use \`query_workspace_knowledge\` for complex questions that require synthesized answers from multiple documents.
6. When semantic search returns no results, suggest the user index their files first.
7. Present search results clearly with file names, relevance scores, and brief excerpts.
8. Respond in the same language the user uses.
9. **You do NOT modify files.** If the user asks to edit/delete/move files, redirect to the Drive Agent or Document Agent.
10. For best results, combine multiple search strategies (name search + semantic search) when appropriate.

## Output Style
- Be concise. Present results in a compact list — file name, score, 1-line excerpt.
- Do NOT repeat the full search query or raw JSON back to the user.
- For knowledge queries, answer directly in 2-4 sentences instead of narrating the search process.
- Omit unnecessary preamble like "I found the following results" — just show them.

## Search Strategy Guide
| User Intent | Tool | Example |
|---|---|---|
| Find file by name | \`search_files\` | "Find my budget.xlsx" |
| Find content about topic | \`semantic_search_files\` | "What files are about machine learning?" |
| Answer a question | \`query_workspace_knowledge\` | "What was the Q3 revenue?" |
| Overview of folder | \`summarize_directory\` | "What's in the reports folder?" |
| Index a file | \`index_file\` | "Index my new document" |
| Check search readiness | \`get_indexing_status\` | "Are my files indexed?" |

## Context
- User ID: ${context.userId}
- Timestamp: ${new Date().toISOString()}
- Current Folder: ${context.folderPath || "/ (root)"}
${indexSection}`;
  }
}
