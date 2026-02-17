import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentService } from "@/services/agent.service";
import { useAgentStore } from "@/stores/useAgentStore";
import type { AgentMessage } from "@/types/agent.types";
import { toast } from "sonner";

export function useAgentChat() {
  const queryClient = useQueryClient();
  const {
    conversationId,
    messages,
    isLoading,
    addMessage,
    setConversationId,
    setMessages,
    setLoading,
    newConversation,
  } = useAgentStore();

  const chatMutation = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      return agentService.chat(message, conversationId || undefined);
    },
    onSuccess: (response) => {
      if (response.data) {
        const { conversationId: newConvId, message: assistantMsg } =
          response.data;
        setConversationId(newConvId);
        addMessage(assistantMsg);
        // Refresh conversation list
        queryClient.invalidateQueries({ queryKey: ["agent-conversations"] });
      }
      setLoading(false);
    },
    onError: (error: { message?: string }) => {
      setLoading(false);
      const errorMessage: AgentMessage = {
        role: "assistant",
        content: `Sorry, an error occurred: ${error.message || "Unknown error"}. Please try again.`,
        timestamp: new Date().toISOString(),
      };
      addMessage(errorMessage);
    },
  });

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: AgentMessage = {
        role: "user",
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };
      addMessage(userMessage);
      setLoading(true);

      chatMutation.mutate({ message: text.trim() });
    },
    [isLoading, addMessage, setLoading, chatMutation],
  );

  return {
    messages,
    isLoading,
    conversationId,
    sendMessage,
    newConversation,
    setMessages,
    setConversationId,
  };
}

// Hook for listing conversations
export function useAgentConversations() {
  return useQuery({
    queryKey: ["agent-conversations"],
    queryFn: async () => {
      const response = await agentService.listConversations();
      return response.data?.conversations || [];
    },
    staleTime: 30_000,
  });
}

// Hook for loading a specific conversation
export function useLoadConversation() {
  const { setConversationId, setMessages } = useAgentStore();

  const loadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      return agentService.getConversation(conversationId);
    },
    onSuccess: (response) => {
      if (response.data) {
        setConversationId(response.data.id);
        setMessages(response.data.messages);
      }
    },
    onError: () => {
      toast.error("Failed to load conversation");
    },
  });

  return {
    loadConversation: loadMutation.mutate,
    isLoading: loadMutation.isPending,
  };
}

// Hook for deleting a conversation
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  const { conversationId, newConversation } = useAgentStore();

  return useMutation({
    mutationFn: async (id: string) => {
      return agentService.deleteConversation(id);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["agent-conversations"] });
      if (deletedId === conversationId) {
        newConversation();
      }
      toast.success("Conversation deleted");
    },
    onError: () => {
      toast.error("Failed to delete conversation");
    },
  });
}

// Hook for checking agent availability
export function useAgentStatus() {
  return useQuery({
    queryKey: ["agent-status"],
    queryFn: async () => {
      const response = await agentService.getStatus();
      return response.data;
    },
    staleTime: 60_000,
    retry: false,
  });
}
