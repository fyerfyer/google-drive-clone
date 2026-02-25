import { IMessage } from "../../models/Conversation.model";

export type AgentType = "drive" | "document" | "search";

export type OperationRisk = "safe" | "moderate" | "dangerous";

// 从前端注入的上下文，让 Agent 了解用户所在的位置。
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

export interface RouteDecision {
  route_to: AgentType;
  confidence: number;
  reason: string;
  source: "explicit" | "conversation" | "pattern" | "llm" | "default";
}

// Agent meta 描述，注册到 Router 中用于 LLM 判定路由
export interface AgentMeta {
  type: AgentType;
  description: string;
  capabilities: string[];
}

export const AGENT_REGISTRY: AgentMeta[] = [
  {
    type: "drive",
    description:
      "Responsible for file and folder management operations, including creating, deleting, moving, renaming, sharing, and permission management.",
    capabilities: [
      "File/folder CRUD (create, rename, move, delete, recycle bin)",
      "Sharing and permission management (share links, direct sharing, permission viewing)",
      "File starring, obtaining download links",
      "Directory summarization",
    ],
  },
  {
    type: "document",
    description:
      "Responsible for document content writing and editing tasks, including reading, writing, and patch-modifying document content.",
    capabilities: [
      "Document content read and write",
      "Precise patch editing (replace, insert, append, delete text)",
      "Article writing, polishing, translation, rewriting",
    ],
  },
  {
    type: "search",
    description:
      "Responsible for search, knowledge retrieval, and information query tasks, including file search, semantic search, knowledge-base QA, and index management.",
    capabilities: [
      "Filename/extension search",
      "Semantic search (embedding-based similar content retrieval)",
      "Knowledge-base QA (RAG queries)",
      "File index management",
      "Indexing status inspection",
    ],
  },
];

export const AGENT_TASK_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
  FAILED: "failed",
  NOT_FOUND: "not_found",
} as const;

export type AgentTaskStatus =
  (typeof AGENT_TASK_STATUS)[keyof typeof AGENT_TASK_STATUS];

export interface AgentTaskData {
  taskId: string;
  userId: string;
  message: string;
  conversationId?: string;
  context?: {
    type?: AgentType;
    folderId?: string;
    fileId?: string;
  };
}

export interface AgentTaskResult {
  taskId: string;
  conversationId: string;
  agentType: AgentType;
  // 最终 assistant 消息内容
  content: string;
  success: boolean;
  error?: string;
}

export interface AgentTaskStatusResponse {
  status: AgentTaskStatus;
  result?: AgentTaskResult;
  error?: string;
}

export const TASK_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export interface TaskStep {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  agentType?: AgentType;
  result?: string;
  error?: string;
}

export interface TaskPlan {
  goal: string;
  steps: TaskStep[];
  currentStep: number;
  isComplete: boolean;
  summary?: string;
}

export interface ConversationSummary {
  summary: string;
  messageRange: { from: number; to: number };
  createdAt: Date;
}

export interface MemoryState {
  // 压缩后的历史摘要
  summaries: ConversationSummary[];
  // 滑动窗口内的原始消息
  recentMessages: IMessage[];
  //  当前活跃的任务计划
  activePlan?: TaskPlan;
  // 总消息数
  totalMessageCount: number;
}

export const APPROVAL_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXPIRED: "expired",
} as const;

export type ApprovalStatus =
  (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

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
  // Sharing
  "create_share_link",
  "list_share_links",
  "revoke_share_link",
  "share_with_users",
  "get_permissions",
  "list_shared_with_me",

  "search_files",
  "list_files",
]);

export const DOCUMENT_AGENT_TOOLS = new Set([
  "read_file",
  "patch_file",
  "get_file_info",
  // Context 增强
  "list_folder_contents",
  "search_files",
]);

export const SEARCH_AGENT_TOOLS = new Set([
  // search
  "search_files",
  "semantic_search_files",
  "query_workspace_knowledge",
  "summarize_directory",
  // Knowledge Layer 管理
  "index_file",
  "index_all_files",
  "get_indexing_status",
  "get_file_info",
  "read_file",
  "list_folder_contents",
  "get_folder_path",
  "list_files",
]);

export const OPERATION_RISK: Record<string, OperationRisk> = {
  // Safe
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

  // Moderate
  create_file: "moderate",
  write_file: "dangerous",
  patch_file: "dangerous",
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

  // Dangerous
  trash_file: "dangerous",
  trash_folder: "dangerous",
  delete_file: "dangerous",
  delete_folder: "dangerous",
  revoke_share_link: "dangerous",
  share_with_users: "dangerous",
};

// 限流
export const MAX_TOOL_CALLS_PER_TURN = 15;

export const CHARS_PER_TOKEN = 4;
export const MAX_CONTEXT_TOKENS = 120_000;
export const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN;
export const MAX_TOOL_RESULT_CHARS = 20_000;
export const MAX_HISTORY_MESSAGES = 20;

export const APPROVAL_TTL_SECONDS = 300;

// 当 regex 匹配置信度低于此阈值时，调用 LLM Router
export const PATTERN_CONFIDENCE_THRESHOLD = 0.6;

// 滑动窗口保留的最近消息数
export const MEMORY_SLIDING_WINDOW = 10;

// 超过多少条消息后开始生成摘要
export const MEMORY_SUMMARY_THRESHOLD = 16;

// 判定为复杂任务的阈值（需要拆分的步骤数）
export const TASK_COMPLEXITY_THRESHOLD = 2;

// 工具调用失败后的最大重试次数
export const MAX_TOOL_RETRIES = 2;

// Agent 事件类型（用于 SSE 流式传输）
export const AGENT_EVENT_TYPE = {
  ROUTE_DECISION: "route_decision",
  TASK_PLAN: "task_plan",
  TASK_STEP_UPDATE: "task_step_update",
  TOOL_CALL_START: "tool_call_start",
  TOOL_CALL_END: "tool_call_end",
  CONTENT: "content",
  APPROVAL_NEEDED: "approval_needed",
  APPROVAL_RESOLVED: "approval_resolved",
  DONE: "done",
  ERROR: "error",
} as const;

export type AgentEventType =
  (typeof AGENT_EVENT_TYPE)[keyof typeof AGENT_EVENT_TYPE];

export interface AgentStreamEvent {
  type: AgentEventType;
  data: Record<string, unknown>;
}

// Agent 事件回调函数类型
export type AgentEventCallback = (event: AgentStreamEvent) => void;
