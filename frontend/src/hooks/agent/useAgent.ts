import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentService } from "@/services/agent.service";
import { useAgentStore } from "@/stores/useAgentStore";
import type {
  AgentMessage,
  AgentType,
  AgentStreamEvent,
  TaskStatus,
} from "@/types/agent.types";
import { AGENT_EVENT_TYPE, TASK_STATUS } from "@/types/agent.types";
import { toast } from "sonner";

export function useAgentChat() {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const {
    conversationId,
    messages,
    isLoading,
    context,
    addMessage,
    setConversationId,
    setMessages,
    setLoading,
    setRouteDecision,
    setTaskPlan,
    updateTaskStep,
    setAgentType,
    setStreaming,
    appendStreamingContent,
    addStreamingToolCall,
    updateLastStreamingToolCall,
    setStreamingStepId,
    setStreamingError,
    clearStreamingState,
    addPendingApproval,
    removePendingApproval,
    finalizeStreaming,
    newConversation,
  } = useAgentStore();

  const sendMessage = useCallback(
    async (
      text: string,
      contextType?: AgentType,
      options?: { silent?: boolean },
    ) => {
      // Check live store state to prevent race conditions from stale closures
      const liveState = useAgentStore.getState();
      if (!text.trim() || isLoading || liveState.isLoading) return;

      // Add user message immediately (unless silent mode for auto-continue)
      if (!options?.silent) {
        const userMessage: AgentMessage = {
          role: "user",
          content: text.trim(),
          timestamp: new Date().toISOString(),
        };
        addMessage(userMessage);
      }
      setLoading(true);
      setStreaming(true);
      clearStreamingState();
      // Re-set streaming after clear
      useAgentStore.setState({ isStreaming: true });

      // Create abort controller for cancellation
      const abortController = new AbortController();
      abortRef.current = abortController;

      const handleEvent = (event: AgentStreamEvent) => {
        switch (event.type) {
          case AGENT_EVENT_TYPE.ROUTE_DECISION: {
            const data = event.data as {
              agentType: AgentType;
              confidence: number;
              source: string;
              reason: string;
            };
            setAgentType(data.agentType);
            setRouteDecision({
              confidence: data.confidence,
              source: data.source as any,
              reason: data.reason,
            });
            break;
          }

          case AGENT_EVENT_TYPE.TASK_PLAN: {
            const data = event.data as { plan: any };
            setTaskPlan(data.plan);
            break;
          }

          case AGENT_EVENT_TYPE.TASK_STEP_UPDATE: {
            const data = event.data as {
              stepId: number;
              status: TaskStatus;
              title?: string;
              result?: string;
              error?: string;
            };
            updateTaskStep(data.stepId, {
              status: data.status,
              result: data.result,
              error: data.error,
            });
            if (data.status === TASK_STATUS.IN_PROGRESS) {
              setStreamingStepId(data.stepId);
            }
            break;
          }

          case AGENT_EVENT_TYPE.TOOL_CALL_START: {
            const data = event.data as {
              toolName: string;
              args: Record<string, unknown>;
            };
            addStreamingToolCall({
              toolName: data.toolName,
              args: data.args,
            });
            break;
          }

          case AGENT_EVENT_TYPE.TOOL_CALL_END: {
            const data = event.data as {
              toolName: string;
              result: string;
              isError: boolean;
            };
            updateLastStreamingToolCall({
              result: data.result,
              isError: data.isError,
            });
            break;
          }

          case AGENT_EVENT_TYPE.CONTENT: {
            const data = event.data as { content: string };
            appendStreamingContent(data.content);
            break;
          }

          case AGENT_EVENT_TYPE.APPROVAL_NEEDED: {
            const data = event.data as {
              approvalId: string;
              toolName: string;
              reason: string;
              args: Record<string, unknown>;
            };
            addPendingApproval({
              approvalId: data.approvalId,
              toolName: data.toolName,
              reason: data.reason,
              args: data.args,
            });
            break;
          }

          case AGENT_EVENT_TYPE.APPROVAL_RESOLVED: {
            const data = event.data as {
              approvalId: string;
              approved: boolean;
            };
            // Remove the approval card from the UI — the SSE stream will
            // continue with tool_call_end / content events automatically
            removePendingApproval(data.approvalId);
            break;
          }

          case AGENT_EVENT_TYPE.DONE: {
            const data = event.data as any;
            if (data.conversationId) {
              setConversationId(data.conversationId);
            }
            if (data.agentType) {
              setAgentType(data.agentType);
            }
            if (data.taskPlan) {
              setTaskPlan(data.taskPlan);
            }

            // Finalize: add the final assistant message
            if (data.message) {
              finalizeStreaming(data.message);
            } else {
              finalizeStreaming();
            }

            // Refresh conversation list
            queryClient.invalidateQueries({
              queryKey: ["agent-conversations"],
            });
            break;
          }

          case AGENT_EVENT_TYPE.ERROR: {
            const data = event.data as { message: string };
            setStreamingError(data.message);
            finalizeStreaming();
            break;
          }
        }
      };

      try {
        await agentService.chatStream(
          {
            message: text.trim(),
            conversationId: conversationId || undefined,
            context: {
              type: contextType || context.type,
              folderId: context.folderId,
              fileId: context.fileId,
            },
          },
          handleEvent,
          abortController.signal,
        );

        // If stream ended without a done event, finalize anyway
        const state = useAgentStore.getState();
        if (state.isStreaming) {
          finalizeStreaming();
        }
      } catch (error: any) {
        if (error.name === "AbortError") return;
        const errMsg = error.message || "Unknown error";
        setStreamingError(errMsg);
        finalizeStreaming();
      }
    },
    [
      isLoading,
      conversationId,
      context,
      addMessage,
      setLoading,
      setStreaming,
      clearStreamingState,
      setAgentType,
      setRouteDecision,
      setTaskPlan,
      updateTaskStep,
      setStreamingStepId,
      addStreamingToolCall,
      updateLastStreamingToolCall,
      appendStreamingContent,
      addPendingApproval,
      removePendingApproval,
      setConversationId,
      finalizeStreaming,
      setStreamingError,
      queryClient,
    ],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    clearStreamingState();
    setLoading(false);
  }, [clearStreamingState, setLoading]);

  return {
    messages,
    isLoading,
    conversationId,
    sendMessage,
    cancelStream,
    newConversation,
    setMessages,
    setConversationId,
  };
}

// Hook for resolving approvals (approve/reject) with optional modified args.
// The SSE stream stays open while waiting for approval — no auto-continue needed.
export function useResolveApproval() {
  const { removePendingApproval } = useAgentStore();

  return useMutation({
    mutationFn: async ({
      approvalId,
      approved,
      modifiedArgs,
    }: {
      approvalId: string;
      approved: boolean;
      modifiedArgs?: Record<string, unknown>;
    }) => {
      return agentService.resolveApproval(approvalId, approved, modifiedArgs);
    },
    onSuccess: (response, { approvalId, approved }) => {
      // Note: the approval card will also be removed by the SSE
      // `approval_resolved` event, but we remove it here too for
      // immediate UX feedback
      removePendingApproval(approvalId);
      if (approved) {
        toast.success(response.data?.message || "Operation approved");
      } else {
        toast.info("Operation rejected");
      }
    },
    onError: () => {
      toast.error("Failed to resolve approval");
    },
  });
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
  const {
    setConversationId,
    setMessages,
    setTaskPlan,
    setRouteDecision,
    setAgentType,
  } = useAgentStore();

  const loadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      return agentService.getConversation(conversationId);
    },
    onSuccess: (response) => {
      if (response.data) {
        setConversationId(response.data.id);
        setMessages(response.data.messages);
        if (response.data.agentType) {
          setAgentType(response.data.agentType);
        }
        if (response.data.activePlan) {
          setTaskPlan(response.data.activePlan);
        }
        if (response.data.routeDecision) {
          setRouteDecision(response.data.routeDecision);
        }
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
