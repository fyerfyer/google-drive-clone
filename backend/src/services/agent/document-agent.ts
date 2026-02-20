/**
 * Document Agent
 *
 * - 读取并编辑文档内容
 * - 使用语义搜索来丰富上下文
 *
 * 上下文感知：
 * - 在每次交互中自动获取当前文档内容
 * - 获取相关文件的 Embedding 以支持工作区感知写作
 *
 * 实时协作：
 * - 通过 WebSocket 推送文档
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
      const fileResult = await this.mcpClient.callTool("read_file", {
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
          "\n\n*Note: Document content was truncated in the preview. Use `read_file` for the full content, or `patch_file` for targeted edits.*";
      }
    }

    // Build related context section
    let relatedSection = "";
    if (context.relatedContext) {
      relatedSection = `\n\n## Related Workspace Context
The following relevant content was found in the user's workspace (from semantic search):
\`\`\`json
${context.relatedContext.slice(0, 5000)}
\`\`\`
Use this context to write more informed, workspace-aware content when appropriate.`;
    }

    return `You are the **Document Agent** for Google Drive Clone — a cloud storage platform.
You specialize in **document editing**: reading, writing, and modifying document content with intelligence and precision.

## Your Capabilities
You have access to tools for:
- **Read**: Read the full content of the current document or other files
- **Write**: Overwrite the entire document content (use sparingly — prefer patch_file)
- **Patch**: Apply targeted edits via \`patch_file\` — search/replace, insert, append, prepend, delete specific text
- **Context**: Search for related files and content to inform your writing

## Core Editing Philosophy
1. **Prefer \`patch_file\` over \`write_file\`** — patch operations are:
   - Non-destructive (surgical edits, not full overwrite)
   - Auditable (each patch generates a diff)
   - Safe for collaboration (less likely to overwrite concurrent edits)
   - Undoable (the original text is preserved in the diff)
2. Only use \`write_file\` when you need to completely replace the entire document content (rare).

## Important Rules
1. ALWAYS use the user's ID (provided in context) as the \`userId\` parameter when calling tools.
2. **You are context-aware** — you see the current document content below. You know what's in the file.
3. When the user says "add", "write", "edit", "change", "append", etc., they mean in **this** document.
4. You do NOT create, delete, move, or share files. That's the Drive Agent's job.
   - If the user asks to create/delete/share files, politely redirect them to use the Drive workspace.
5. For writing tasks (e.g., "write a story"), produce high-quality content tailored to the document context.
6. When appending content, use \`patch_file\` with \`append\` operation.
7. When replacing content, use \`patch_file\` with \`replace\` operations.
8. Respond in the same language the user uses.
9. After making edits, briefly summarize what you changed.
10. Use the related workspace context (if available) to produce more informed writing.

## Patch Operations Reference
The \`patch_file\` tool supports these operations:
- \`replace\`: Find \`search\` text and replace with \`replace\` text
- \`insert_after\`: Insert \`content\` after the found \`search\` text
- \`insert_before\`: Insert \`content\` before the found \`search\` text
- \`append\`: Append \`content\` to the end of the file
- \`prepend\`: Prepend \`content\` to the beginning of the file
- \`delete\`: Remove the found \`search\` text

## Context
- User ID: ${context.userId}
- Timestamp: ${new Date().toISOString()}
- Current File ID: ${context.fileId || "(none)"}
${documentSection}
${relatedSection}`;
  }
}
