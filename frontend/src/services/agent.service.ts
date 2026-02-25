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
  /** Check if Agent is configured and available */
  getStatus: () => api.get<AgentStatus>("/api/agent/status"),

  /**
   * Submit a chat message to the BullMQ async task queue.
   * Returns a taskId that can be used with streamTaskEvents.
   */
  chatAsync: (request: AgentChatRequest) =>
    api.post<{ taskId: string }, AgentChatRequest>("/api/agent/chat", request),

  /** Get the status of an async task */
  getTaskStatus: (taskId: string) =>
    api.get<AgentTaskStatusResponse>(`/api/agent/tasks/${taskId}`),

  /**
   * Subscribe to real-time SSE events for an async task via Redis Pub/Sub.
   * This is the counterpart to chatAsync — call it right after queueing the task.
   */
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

  /** List all conversations */
  listConversations: () =>
    api.get<{ conversations: ConversationSummary[] }>(
      "/api/agent/conversations",
    ),

  /** Get a specific conversation with full history */
  getConversation: (conversationId: string) =>
    api.get<ConversationDetail>(`/api/agent/conversations/${conversationId}`),

  /** Delete a conversation */
  deleteConversation: (conversationId: string) =>
    api.delete(`/api/agent/conversations/${conversationId}`),

  /** Get pending approvals */
  getPendingApprovals: () =>
    api.get<{ approvals: PendingApproval[] }>("/api/agent/approvals"),

  /** Resolve an approval (approve or reject), optionally with modified args */
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
};
