import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentService } from "@/services/agent.service";
import { useAgentStore } from "@/stores/useAgentStore";
import {
  useBackgroundTasksStore,
  getBackgroundTaskByConversationId,
} from "@/stores/useBackgroundTasksStore";
import {
  agentTaskRunner,
  detachCurrentTask,
  attachBackgroundTask,
} from "@/lib/agentTaskRunner";
import { loadTracesFromCache } from "@/lib/traceCache";
import type { AgentMessage, AgentType } from "@/types/agent.types";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════
   useAgentChat — main hook for sending messages & managing
   the current conversation.  The heavy SSE event‑handling has
   moved to agentTaskRunner so it survives conversation switches.
   ═══════════════════════════════════════════════════════════════ */

export function useAgentChat() {
  const messages = useAgentStore((s) => s.messages);
  const isLoading = useAgentStore((s) => s.isLoading);
  const conversationId = useAgentStore((s) => s.conversationId);

  /**
   * Send a message.  The flow:
   * 1. (If a task is running for the current chat, it means we already
   *     have an SSE open — this should not happen since we disable
   *     the input while streaming.  But if it does, bail.)
   * 2. Add user message to the store.
   * 3. chatAsync → get taskId from BullMQ.
   * 4. agentTaskRunner.start() — fire-and-forget SSE that routes
   *    events to the main store (attached) or background store
   *    (if the user switches conversations before it finishes).
   */
  const sendMessage = useCallback(
    async (text: string, contextType?: AgentType) => {
      const s = useAgentStore.getState();
      if (!text.trim() || s.isLoading) return;

      // Add user message
      const userMessage: AgentMessage = {
        role: "user",
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };
      s.addMessage(userMessage);
      s.setLoading(true);
      s.setStreaming(true);
      s.clearStreamingState();
      // clearStreamingState resets isStreaming — re-set it
      useAgentStore.setState({ isStreaming: true, isLoading: true });

      try {
        const res = await agentService.chatAsync({
          message: text.trim(),
          conversationId: s.conversationId || undefined,
          context: {
            type: contextType || s.context.type,
            folderId: s.context.folderId,
            fileId: s.context.fileId,
          },
        });

        const taskId = res.data?.taskId;
        if (!taskId) throw new Error("No taskId returned");

        // Store the taskId so we can detach it later
        useAgentStore.getState().setCurrentTaskId(taskId);

        // Fire-and-forget SSE — events routed by the task runner
        agentTaskRunner.start(taskId, s.conversationId, /* attached */ true);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        useAgentStore.getState().setStreamingError(msg);
        useAgentStore.getState().finalizeStreaming();
      }
    },
    [],
  );

  /**
   * Start a new conversation.  If a task is currently streaming,
   * it gets detached to the background store and keeps running.
   */
  const newConversation = useCallback(() => {
    const s = useAgentStore.getState();
    if (s.currentTaskId && (s.isLoading || s.isStreaming)) {
      detachCurrentTask();
    }
    s.newConversation();
  }, []);

  /**
   * Cancel the current task (truly abort the SSE connection).
   */
  const cancelStream = useCallback(() => {
    const s = useAgentStore.getState();
    if (s.currentTaskId) {
      agentTaskRunner.abort(s.currentTaskId);
      useBackgroundTasksStore.getState().removeTask(s.currentTaskId);
    }
    s.clearStreamingState();
    s.setLoading(false);
    s.setCurrentTaskId(null);
  }, []);

  return {
    messages,
    isLoading,
    conversationId,
    sendMessage,
    cancelStream,
    newConversation,
  };
}

/* ═══════════════════════════════════════════════════════════════
   useResolveApproval — approve / reject a pending operation
   ═══════════════════════════════════════════════════════════════ */

export function useResolveApproval() {
  const removePendingApproval = useAgentStore((s) => s.removePendingApproval);

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

/* ═══════════════════════════════════════════════════════════════
   useAgentConversations — query for the conversation list
   ═══════════════════════════════════════════════════════════════ */

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

export function useLoadConversation() {
  const apiMutation = useMutation({
    mutationFn: (conversationId: string) =>
      agentService.getConversation(conversationId),
    onSuccess: (response) => {
      if (response.data) {
        const s = useAgentStore.getState();
        s.setConversationId(response.data.id);
        s.setMessages(response.data.messages);
        s.setCurrentTaskId(null);
        if (response.data.agentType) s.setAgentType(response.data.agentType);
        if (response.data.activePlan) s.setTaskPlan(response.data.activePlan);
        if (response.data.routeDecision)
          s.setRouteDecision(response.data.routeDecision);
        // Ensure clean streaming state for loaded conversations
        useAgentStore.setState({
          isLoading: false,
          isStreaming: false,
          streamingContent: "",
          streamingToolCalls: [],
          streamingStepId: null,
          streamingError: null,
          pendingApprovals: [],
        });
        // Restore any cached trace entries for this conversation
        const cachedTraces = loadTracesFromCache(response.data.id);
        if (cachedTraces.length > 0) {
          useAgentStore.setState({ traceEntries: cachedTraces });
        }
      }
    },
    onError: () => {
      toast.error("Failed to load conversation");
    },
  });

  const loadConversation = useCallback(
    (conversationId: string | null, taskId?: string | null) => {
      // Detach current running task if any
      const s = useAgentStore.getState();
      if (s.currentTaskId && (s.isLoading || s.isStreaming)) {
        detachCurrentTask();
      }

      // If we have a taskId, try to attach that background task directly
      if (taskId) {
        const attached = attachBackgroundTask(taskId);
        if (attached) return;
      }

      // Fall back to lookup by conversationId
      if (conversationId) {
        const bgTask = getBackgroundTaskByConversationId(conversationId);
        if (bgTask) {
          attachBackgroundTask(bgTask.taskId);
          return;
        }
        // Load from API
        apiMutation.mutate(conversationId);
      }
    },
    [apiMutation],
  );

  return {
    loadConversation,
    isLoading: apiMutation.isPending,
  };
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => agentService.deleteConversation(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["agent-conversations"] });
      const s = useAgentStore.getState();
      if (deletedId === s.conversationId) s.newConversation();
      toast.success("Conversation deleted");
    },
    onError: () => {
      toast.error("Failed to delete conversation");
    },
  });
}

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
