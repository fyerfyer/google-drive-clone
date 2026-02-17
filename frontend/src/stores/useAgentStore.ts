import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { AgentMessage } from "@/types/agent.types";

interface AgentState {
  // Panel visibility
  isOpen: boolean;

  // Current conversation
  conversationId: string | null;
  messages: AgentMessage[];

  // Loading state
  isLoading: boolean;

  // Actions
  open: () => void;
  close: () => void;
  toggle: () => void;
  setConversationId: (id: string | null) => void;
  addMessage: (message: AgentMessage) => void;
  setMessages: (messages: AgentMessage[]) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  newConversation: () => void;
}

export const useAgentStore = create<AgentState>()(
  devtools(
    (set) => ({
      isOpen: false,
      conversationId: null,
      messages: [],
      isLoading: false,

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),

      setConversationId: (id) => set({ conversationId: id }),
      addMessage: (message) =>
        set((s) => ({ messages: [...s.messages, message] })),
      setMessages: (messages) => set({ messages }),
      clearMessages: () => set({ messages: [], conversationId: null }),
      setLoading: (loading) => set({ isLoading: loading }),
      newConversation: () => set({ conversationId: null, messages: [] }),
    }),
    { name: "agent-store" },
  ),
);
