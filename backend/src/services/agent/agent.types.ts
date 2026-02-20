export type AgentType = "drive" | "document";

export type OperationRisk = "safe" | "moderate" | "dangerous";

/**
 * 从前端注入的上下文，让 Agent 了解用户所在的位置。
 *   - drive：用户正在浏览文件管理器 -> folderId 是当前文件夹的 ID
 *   - document：用户正在编辑文档 -> fileId 是当前打开文件的 ID
 */
export interface AgentContext {
  type: AgentType;
  userId: string;
  folderId?: string;
  fileId?: string;
  folderPath?: string;
  workspaceSnapshot?: string;
  documentContent?: string;
  documentName?: string;
  relatedContext?: string;
}

// Approve Flow

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface ApprovalRequest {
  id: string;
  userId: string;
  conversationId: string;
  toolName: string;
  args: Record<string, unknown>;
  risk: OperationRisk;
  reason: string;
  status: ApprovalStatus;
  createdAt: Date;
  resolvedAt?: Date;
  ttlSeconds: number;
}

export interface GatewayDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
  approvalId?: string;
}

// LLM 消息类型
export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

export interface LlmToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmChoice {
  message: LlmMessage;
  finish_reason: string;
}

export interface LlmResponse {
  choices: LlmChoice[];
}

// Patch 操作
export type PatchOp =
  | { op: "replace"; search: string; replace: string }
  | { op: "insert_after"; search: string; content: string }
  | { op: "insert_before"; search: string; content: string }
  | { op: "append"; content: string }
  | { op: "prepend"; content: string }
  | { op: "delete"; search: string };

export interface PatchResult {
  applied: number;
  failed: number;
  diff: string;
  newContent: string;
}

// Tools
export const DRIVE_AGENT_TOOLS = new Set([
  // File CRUD
  "list_files",
  "get_file_info",
  "create_file",
  "rename_file",
  "move_file",
  "trash_file",
  "restore_file",
  "delete_file",
  "star_file",
  "get_download_url",
  // Folder CRUD
  "list_folder_contents",
  "create_folder",
  "rename_folder",
  "move_folder",
  "trash_folder",
  "restore_folder",
  "delete_folder",
  "get_folder_path",
  "star_folder",
  // Search
  "search_files",
  "summarize_directory",
  "query_workspace_knowledge",
  // Sharing
  "create_share_link",
  "list_share_links",
  "revoke_share_link",
  "share_with_users",
  "get_permissions",
  "list_shared_with_me",
  // Knowledge Layer
  "index_file",
  "index_all_files",
  "semantic_search_files",
  "get_indexing_status",
]);

export const DOCUMENT_AGENT_TOOLS = new Set([
  // Read & Write
  "read_file",
  "write_file",
  "patch_file",
  "get_file_info",
  // Context enrichment (read-only)
  "list_folder_contents",
  "search_files",
  "semantic_search_files",
  "query_workspace_knowledge",
  "get_indexing_status",
]);

export const OPERATION_RISK: Record<string, OperationRisk> = {
  // Safe — read-only operations
  list_files: "safe",
  get_file_info: "safe",
  read_file: "safe",
  list_folder_contents: "safe",
  get_folder_path: "safe",
  search_files: "safe",
  summarize_directory: "safe",
  query_workspace_knowledge: "safe",
  get_permissions: "safe",
  list_share_links: "safe",
  list_shared_with_me: "safe",
  get_download_url: "safe",
  get_indexing_status: "safe",
  semantic_search_files: "safe",
  whoami: "safe",
  authenticate: "safe",

  // Moderate — create / update operations
  create_file: "moderate",
  write_file: "moderate",
  patch_file: "moderate",
  rename_file: "moderate",
  move_file: "moderate",
  star_file: "moderate",
  create_folder: "moderate",
  rename_folder: "moderate",
  move_folder: "moderate",
  star_folder: "moderate",
  create_share_link: "moderate",
  restore_file: "moderate",
  restore_folder: "moderate",
  index_file: "moderate",
  index_all_files: "moderate",

  // Dangerous — destructive or sensitive operations (require approval)
  trash_file: "dangerous",
  trash_folder: "dangerous",
  delete_file: "dangerous",
  delete_folder: "dangerous",
  revoke_share_link: "dangerous",
  share_with_users: "dangerous",
};

// 限流
export const MAX_TOOL_CALLS_PER_TURN = 15;

/** Maximum chars for context window */
export const CHARS_PER_TOKEN = 4;
export const MAX_CONTEXT_TOKENS = 120_000;
export const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN;
export const MAX_TOOL_RESULT_CHARS = 20_000;
export const MAX_HISTORY_MESSAGES = 20;

/** Approval TTL (5 minutes) */
export const APPROVAL_TTL_SECONDS = 300;
