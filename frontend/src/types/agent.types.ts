export type AgentType = "drive" | "document" | "search";

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

export interface RouteDecision {
  confidence: number;
  source: "explicit" | "conversation" | "pattern" | "llm" | "default";
  reason: string;
}

export interface PendingApproval {
  approvalId: string;
  toolName: string;
  reason: string;
  args: Record<string, unknown>;
}

export interface ApprovalResult {
  success: boolean;
  result?: {
    toolName: string;
    output: string;
    isError: boolean;
  };
  message: string;
  hasRemainingSteps?: boolean;
}

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

export interface AgentStatus {
  status: string;
  agents: AgentMeta[];
}

export interface AgentMeta {
  label: string;
  description: string;
}

export const AGENT_REGISTRY: Record<AgentType, AgentMeta> = {
  drive: {
    label: "Drive Agent",
    description:
      "Manages files and folders — create, delete, move, rename, share, and permissions.",
  },
  document: {
    label: "Document Agent",
    description:
      "Reads, writes, and edits document content with precise patch operations.",
  },
  search: {
    label: "Search Agent",
    description:
      "Searches files, semantic search, knowledge queries, and index management.",
  },
};

export interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCall[];
  timestamp: string;
}

export interface AgentChatResponse {
  conversationId: string;
  agentType: AgentType;
  message: AgentMessage;
  routeDecision?: RouteDecision;
  taskPlan?: TaskPlan;
  pendingApprovals?: PendingApproval[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  agentType?: AgentType;
  lastMessage: string;
  messageCount: number;
  updatedAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  agentType?: AgentType;
  messages: AgentMessage[];
  activePlan?: TaskPlan;
  routeDecision?: RouteDecision;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStatus {
  enabled: boolean;
  model: string;
  provider: string;
}
