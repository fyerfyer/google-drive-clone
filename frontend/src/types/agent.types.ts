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
  message: AgentMessage;
}

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  updatedAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  messages: AgentMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentStatus {
  enabled: boolean;
  model: string;
  provider: string;
}
