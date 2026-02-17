import { api } from "./api";
import type {
  AgentChatResponse,
  AgentStatus,
  ConversationDetail,
  ConversationSummary,
} from "@/types/agent.types";

export const agentService = {
  /** Check if Agent is configured and available */
  getStatus: () => api.get<AgentStatus>("/api/agent/status"),

  /** Send a chat message to the agent */
  chat: (message: string, conversationId?: string) =>
    api.post<AgentChatResponse, { message: string; conversationId?: string }>(
      "/api/agent/chat",
      { message, conversationId },
    ),

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
