import { api } from "./api";
import type {
  AgentStatus,
  AgentType,
  AgentStreamEvent,
  AgentTaskStatusResponse,
  ApprovalResult,
  ConversationDetail,
  ConversationSummary,
  PendingApproval,
  ActiveChat,
  TokenUsage,
  UserTokenBudget,
  TraceEntry,
} from "@/types/agent.types";

export interface AgentChatRequest {
  message: string;
  conversationId?: string;
  context?: {
    type?: AgentType;
    folderId?: string;
    fileId?: string;
  };
}

export const agentService = {
  getStatus: () => api.get<AgentStatus>("/api/agent/status"),

  chatAsync: (request: AgentChatRequest) =>
    api.post<{ taskId: string }, AgentChatRequest>("/api/agent/chat", request),

  getTaskStatus: (taskId: string) =>
    api.get<AgentTaskStatusResponse>(`/api/agent/tasks/${taskId}`),

  streamTaskEvents: async (
    taskId: string,
    onEvent: (event: AgentStreamEvent) => void,
    signal?: AbortSignal,
  ) => {
    const token = localStorage.getItem("token");
    const response = await fetch(`/api/agent/tasks/${taskId}/stream`, {
      method: "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        text || `HTTP ${response.status}: ${response.statusText}`,
      );
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event: AgentStreamEvent = JSON.parse(line.slice(6));
            onEvent(event);
          } catch {
            // Ignore malformed SSE data
          }
        }
      }
    }
  },

  listConversations: () =>
    api.get<{ conversations: ConversationSummary[] }>(
      "/api/agent/conversations",
    ),

  getConversation: (conversationId: string) =>
    api.get<ConversationDetail>(`/api/agent/conversations/${conversationId}`),

  deleteConversation: (conversationId: string) =>
    api.delete(`/api/agent/conversations/${conversationId}`),

  getPendingApprovals: () =>
    api.get<{ approvals: PendingApproval[] }>("/api/agent/approvals"),

  resolveApproval: (
    approvalId: string,
    approved: boolean,
    modifiedArgs?: Record<string, unknown>,
  ) =>
    api.post<
      ApprovalResult,
      { approved: boolean; modifiedArgs?: Record<string, unknown> }
    >(`/api/agent/approve/${approvalId}`, {
      approved,
      ...(modifiedArgs ? { modifiedArgs } : {}),
    }),

  getActiveChats: () =>
    api.get<{ chats: ActiveChat[] }>("/api/agent/dashboard/active-chats"),

  getTokenUsage: (taskId?: string) =>
    api.get<{ daily: TokenUsage; task?: TokenUsage }>(
      `/api/agent/dashboard/token-usage${taskId ? `?taskId=${taskId}` : ""}`,
    ),

  getTokenBudget: () =>
    api.get<{ budget: UserTokenBudget }>("/api/agent/dashboard/token-budget"),

  updateTokenBudget: (budget: Partial<UserTokenBudget>) =>
    api.put<{ budget: UserTokenBudget }, Partial<UserTokenBudget>>(
      "/api/agent/dashboard/token-budget",
      budget,
    ),

  getTaskTraces: (taskId: string) =>
    api.get<{ traces: TraceEntry[] }>(`/api/agent/tasks/${taskId}/traces`),
};
