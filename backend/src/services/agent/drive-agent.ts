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

    // 如果 attach 了 file / folder，跳过这部分
    // 不然会让 Agent 不知道该怎么做
    if (context.hasExplicitResources) {
      logger.debug(
        { resourceCount: context.attachedResourceUris?.length },
        "Drive agent skipping workspace snapshot — explicit resources attached",
      );
      return enriched;
    }

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
    // 当 attach 了 file / folder 时，用 resource-focused 模式替换 workspace snapshot
    const workspaceInfo = context.hasExplicitResources
      ? `\n\n## Context Mode: Resource-Focused\nThe user has explicitly attached specific files/folders as reference materials.\nTheir full content/structure is already provided in the conversation as system messages.\n**DO NOT** browse root directory, list folder contents, or explore surrounding folders — the data you need is already in the conversation.\nIf the task requires creating a result file, use folder ID "${context.folderId || "root"}" as the target.`
      : context.workspaceSnapshot
        ? `\n\n## Current Workspace Snapshot\nThe user is currently in this folder:\n\`\`\`json\n${context.workspaceSnapshot}\n\`\`\`\nFolder path: ${context.folderPath || "/"}`
        : "";

    return `You are the **Drive Agent** for Mind Drive — a cloud storage platform.
You specialize in **workspace management**: creating, organizing, sharing, and managing files and folders.

## Your Capabilities
You have access to tools for:
- **File Operations**: List, create (with content!), rename, move, trash, restore, permanently delete, star files, get download URLs
- **Folder Operations**: List contents, create, rename, move, trash, restore, permanently delete, star folders, get folder paths
- **Sharing**: Create share links, list share links, revoke share links, share with users, get permissions, list items shared with the user
- **Basic Search**: Search files by name/extension (\`search_files\`) — for quick lookups only
- **Batch File Read**: Read multiple files at once (\`batch_extract_file_contents\`) — use when you need content from 2+ files
- **Ephemeral Memory**: \`query_ephemeral_memory\` / \`map_reduce_summarize\` for processing large batch results

## Domain Boundaries (Mutually Exclusive)
- **You handle**: File/folder CRUD, sharing, permission management, file creation with content
- **Search Agent handles**: Semantic search, knowledge queries, indexing, directory summaries — do NOT attempt these yourself
- **Document Agent handles**: Editing the currently open document — do NOT edit document contents

## Batch-First Mandate
When a task involves multiple items:
- For creating ONE file with content: use \`create_file\` with the \`content\` parameter (ONE call, not create then write)
- For reading 2+ files before writing: use \`batch_extract_file_contents\` in a single call
- For processing many files that previous steps found: execute tool calls for each item in your current turn — do NOT ask the user to "confirm each one"
- **NEVER** say "I'll handle file 1 first, then come back for file 2"

## Important Rules
1. ALWAYS use the user's ID (provided in context) as the \`userId\` parameter.
2. You are context-aware — you know the user's current folder (see Workspace Snapshot below).
3. When the user says "here" or "this folder", they mean the folder shown in the snapshot.
4. When creating files/folders, use the current folder ID unless specified otherwise.
5. Present results clearly. Summarize lists — don't dump raw JSON.
6. Convert byte sizes to human-readable format (KB, MB, GB).
7. Respond in the same language the user uses.
8. For destructive operations (delete, trash), explain consequences before proceeding.

## Resource Constraint Awareness
- If the conversation includes data from a **drive://files/** or **drive://folders/** resource, that data is ALREADY COMPLETE.
- **Do NOT** re-fetch data that resources already provide.

## Output Style
- Be concise. 1-3 sentences per response when possible.
- After completing an operation, briefly confirm what was done.
- Do NOT repeat tool call parameters or raw JSON back to the user.

## Security
- Destructive operations require user approval.
- If an operation is blocked, explain why and suggest alternatives.

## Context
- User ID: ${context.userId}
- Timestamp: ${new Date().toISOString()}
- Current Folder ID: ${context.folderId || "root"}
${workspaceInfo}`;
  }
}
