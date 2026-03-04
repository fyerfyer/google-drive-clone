/**
 * Document Agent
 *
 * - 读取并编辑文档内容
 * - 通过补丁操作精确修改文档
 *
 * 上下文感知：
 * - 在每次交互中自动获取当前文档内容
 * - 获取相关文件的 Embedding 以支持工作区感知写作（用于上下文丰富，不暴露给 LLM 工具列表）
 *
 * 实时协作：
 * - 通过 WebSocket 推送文档
 *
 * 搜索功能改为由 SearchAgent 负责，文件管理由 DriveAgent 负责
 */

import { BaseAgent } from "./base-agent";
import { AgentContext, AgentType, DOCUMENT_AGENT_TOOLS } from "./agent.types";
import { McpClientService } from "../mcp-client.service";
import { CapabilityGateway } from "./capability-gateway";
import { logger } from "../../lib/logger";

export class DocumentAgent extends BaseAgent {
  readonly agentType: AgentType = "document";

  constructor(mcpClient: McpClientService, gateway: CapabilityGateway) {
    super(mcpClient, gateway);
  }

  getAllowedTools(): Set<string> {
    return DOCUMENT_AGENT_TOOLS;
  }

  async enrichContext(context: AgentContext): Promise<AgentContext> {
    const enriched = { ...context };

    if (!context.fileId) {
      logger.warn("Document agent invoked without fileId");
      return enriched;
    }

    // 获取当前文档内容
    try {
      const fileResult = await this.mcpClient.callTool("extract_file_content", {
        userId: context.userId,
        fileId: context.fileId,
      });

      const fileData = fileResult.content.map((c) => c.text).join("\n");

      try {
        const parsed = JSON.parse(fileData);
        enriched.documentContent = parsed.content || fileData;
        enriched.documentName = parsed.file?.name || "Unknown document";
      } catch {
        enriched.documentContent = fileData;
        enriched.documentName = "Unknown document";
      }

      logger.debug(
        {
          fileId: context.fileId,
          contentLength: enriched.documentContent?.length,
          docName: enriched.documentName,
        },
        "Document agent: document content loaded",
      );
    } catch (error) {
      logger.warn(
        { error, fileId: context.fileId },
        "Failed to read document content for context enrichment",
      );
      enriched.documentContent = "(Could not load document content)";
    }

    // 通过 semantic search 获取相关文件内容
    try {
      const searchQuery = enriched.documentName || "related documents";
      const searchResult = await this.mcpClient.callTool(
        "semantic_search_files",
        {
          userId: context.userId,
          query: searchQuery,
          limit: 5,
        },
      );

      const searchData = searchResult.content.map((c) => c.text).join("\n");
      if (!searchResult.isError && searchData.length > 10) {
        enriched.relatedContext = searchData;
      }
    } catch {
      logger.debug(
        "Semantic search unavailable for document context enrichment",
      );
    }

    return enriched;
  }

  getSystemPrompt(context: AgentContext): string {
    let documentSection = "";
    if (context.documentContent) {
      const MAX_DOC_CHARS = 30_000;
      const truncated = context.documentContent.length > MAX_DOC_CHARS;
      const content = truncated
        ? context.documentContent.slice(0, MAX_DOC_CHARS)
        : context.documentContent;

      documentSection = `\n\n## Current Document
**Name**: ${context.documentName || "Unknown"}
**File ID**: ${context.fileId}
**Content** (${truncated ? `first ${MAX_DOC_CHARS} chars of ${context.documentContent.length}` : `${content.length} chars`}):
\`\`\`
${content}
\`\`\``;

      if (truncated) {
        documentSection +=
          "\n\n*Note: Document content was truncated in the preview. Use `extract_file_content` for the full content, or `patch_file` for targeted edits.*";
      }
    }

    let relatedSection = "";
    if (context.relatedContext) {
      relatedSection = `\n\n## Related Workspace Context
The following relevant content was found in the user's workspace (from semantic search):
\`\`\`json
${context.relatedContext.slice(0, 5000)}
\`\`\`
Use this context to write more informed, workspace-aware content when appropriate.`;
    }

    return `You are the **Document Agent** for Mind Drive — a cloud storage platform.
You specialize in **editing the CURRENT document** with intelligence and precision.

## Your Capabilities
- **Read**: Read the current document or other files via \`extract_file_content\`
- **Write**: Overwrite entire document content via \`write_file\` (use sparingly)
- **Patch**: Apply targeted edits via \`patch_file\` — replace, insert, append, prepend, delete
- **Context**: Search for related files by name (\`search_files\`)
- **Ephemeral Memory**: \`query_ephemeral_memory\` / \`map_reduce_summarize\` for large context

## Domain Boundaries (Mutually Exclusive)
- **You handle**: Reading and editing the CURRENT open document only
- **Drive Agent handles**: Creating new files, deleting, moving, sharing — do NOT call \`create_file\`
- **Search Agent handles**: Semantic search, knowledge queries, indexing — do NOT attempt these

## Core Editing Rules
1. **Prefer \`patch_file\` over \`write_file\`** — patch is non-destructive and collaboration-safe.
2. Only use \`write_file\` when completely replacing the entire document (rare).
3. Keep \`patch_file\` search text SHORT and UNIQUE (1-2 lines max).

## Batch-First Mandate
When a task references multiple external files for context:
- If you need to read 2+ reference files, mention that \`batch_extract_file_contents\` should be used by the Search Agent in a prior step
- Do NOT loop through files one by one with separate \`extract_file_content\` calls
- If previous step results are in ephemeral memory, use \`query_ephemeral_memory\` to access them

## Important Rules
1. ALWAYS use the user's ID as the \`userId\` parameter.
2. You see the current document content below — you know what's in the file.
3. "add", "write", "edit", "change", "append" = edit THIS document (file ID: ${context.fileId}).
4. **You do NOT create, delete, move, or share files.** That's the Drive Agent's job.
5. All write/patch operations MUST target file ID: ${context.fileId || "(none)"}.
6. Respond in the same language the user uses.
7. Be concise. After edits, state what changed in 1-2 sentences.

## Resource Constraint Awareness
- If a **drive://files/${context.fileId}** resource is in context, the document is ALREADY loaded.
- Do NOT call extract_file_content for the current document — you already have it.

## Patch Operations
- \`replace\`: Find \`search\` text and replace with \`replace\` text
- \`insert_after\` / \`insert_before\`: Insert \`content\` after/before found \`search\` text
- \`append\` / \`prepend\`: Add \`content\` to end/beginning of file
- \`delete\`: Remove the found \`search\` text

## CRITICAL: Empty Document Handling
If current document is EMPTY, ONLY use \`append\` or \`prepend\`.
NEVER use \`replace\`, \`insert_after\`, \`insert_before\`, or \`delete\` on empty documents — it WILL fail.

## Context
- User ID: ${context.userId}
- Current File ID: ${context.fileId || "(none)"}
${documentSection}
${relatedSection}`;
  }
}
