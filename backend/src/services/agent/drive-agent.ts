/**
 * Drive 代理 — 工作区管理专家
 *
 * - 文件/文件夹 CRUD（创建、重命名、移动、移至回收站、永久删除、加星）
 * - 共享（分享链接、直接共享、权限管理）
 * - 基础搜索（按名称查找文件，作为上下文辅助）
 *
 * 上下文感知:
 * - 在每次交互时获取当前文件夹的内容
 * - 了解当前工作目录路径
 *
 * 语义搜索、知识库问答、索引管理等进阶搜索功能由 SearchAgent 负责
 */

import { BaseAgent } from "./base-agent";
import { AgentContext, AgentType, DRIVE_AGENT_TOOLS } from "./agent.types";
import { McpClientService } from "../mcp-client.service";
import { CapabilityGateway } from "./capability-gateway";
import { logger } from "../../lib/logger";

export class DriveAgent extends BaseAgent {
  readonly agentType: AgentType = "drive";

  constructor(mcpClient: McpClientService, gateway: CapabilityGateway) {
    super(mcpClient, gateway);
  }

  getAllowedTools(): Set<string> {
    return DRIVE_AGENT_TOOLS;
  }

  async enrichContext(context: AgentContext): Promise<AgentContext> {
    const enriched = { ...context };

    try {
      const folderId = context.folderId || "root";

      // 获取当前文件夹内容作为上下文
      const contentsResult = await this.mcpClient.callTool(
        "list_folder_contents",
        {
          userId: context.userId,
          folderId,
        },
      );

      enriched.workspaceSnapshot = contentsResult.content
        .map((c) => c.text)
        .join("\n");

      // 获取文件夹路径
      if (folderId !== "root" && folderId) {
        try {
          const pathResult = await this.mcpClient.callTool("get_folder_path", {
            userId: context.userId,
            folderId,
          });
          enriched.folderPath = pathResult.content
            .map((c) => c.text)
            .join("\n");
        } catch {
          enriched.folderPath = "/ (root)";
        }
      } else {
        enriched.folderPath = "/ (root)";
      }

      logger.debug(
        { folderId, hasSnapshot: !!enriched.workspaceSnapshot },
        "Drive agent context enriched",
      );
    } catch (error) {
      logger.warn(
        { error },
        "Failed to enrich drive agent context, proceeding without snapshot",
      );
      enriched.workspaceSnapshot = "(Could not load workspace snapshot)";
      enriched.folderPath = "/ (root)";
    }

    return enriched;
  }

  getSystemPrompt(context: AgentContext): string {
    const workspaceInfo = context.workspaceSnapshot
      ? `\n\n## Current Workspace Snapshot\nThe user is currently in this folder:\n\`\`\`json\n${context.workspaceSnapshot}\n\`\`\`\nFolder path: ${context.folderPath || "/"}`
      : "";

    return `You are the **Drive Agent** for Google Drive Clone — a cloud storage platform.
You specialize in **workspace management**: creating, organizing, sharing, and searching files and folders.

## Your Capabilities
You have access to tools for:
- **File Operations**: List, create, rename, move, trash, restore, permanently delete, star files, get download URLs
- **Folder Operations**: List contents, create, rename, move, trash, restore, permanently delete, star folders, get folder paths
- **Sharing**: Create share links, list share links, revoke share links, share with users, get permissions, list items shared with the user
- **Basic Search**: Search files by name/extension (for context and quick lookups)

> **Note**: For semantic search, knowledge queries, indexing, and directory summaries, the **Search Agent** will handle those requests automatically.

## Important Rules
1. ALWAYS use the user's ID (provided in context) as the \`userId\` parameter when calling tools.
2. **You are context-aware** — you know the user's current folder and its contents (see Workspace Snapshot below).
3. When the user says "here", "this folder", or "current directory", they mean the folder shown in the snapshot.
4. When creating files/folders, use the current folder ID unless the user specifies otherwise.
5. For multi-step operations (e.g., "move all PDFs to folder X"), break them into individual tool calls.
6. Present results clearly. Summarize lists — don't dump raw JSON.
7. Convert byte sizes to human-readable format (KB, MB, GB).
8. Respond in the same language the user uses.
9. **You do NOT edit document contents.** If the user asks to write or edit text inside a document, tell them to switch to the Document Editor and use the Document Agent.
10. For destructive operations (delete, trash), explain the consequences before proceeding.

## Output Style
- Be concise. 1-3 sentences per response when possible.
- After completing an operation, briefly confirm what was done. Do NOT narrate each step.
- For file/folder lists, use compact format (name, size, date) without verbose descriptions.
- Do NOT repeat tool call parameters or raw JSON back to the user.

## Security
- Destructive operations (delete, trash, revoke share links, share with users) require user approval.
- If an operation is blocked, explain why and suggest alternatives.

## Context
- User ID: ${context.userId}
- Timestamp: ${new Date().toISOString()}
- Current Folder ID: ${context.folderId || "root"}
${workspaceInfo}`;
  }
}
