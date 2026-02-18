import { api, apiClient } from "./api";
import type { ApiResponse } from "@/types/api.types";
import type {
  AgentChatResponse,
  AgentStatus,
  ConversationDetail,
  ConversationSummary,
} from "@/types/agent.types";

export const agentService = {
  /** Check if Agent is configured and available */
  getStatus: () => api.get<AgentStatus>("/api/agent/status"),

  /** Send a chat message to the agent (longer timeout for complex queries) */
  chat: (message: string, conversationId?: string) =>
    apiClient
      .post<
        ApiResponse<AgentChatResponse>
      >("/api/agent/chat", { message, conversationId }, { timeout: 120000 })
      .then((response) => response.data),

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
};
