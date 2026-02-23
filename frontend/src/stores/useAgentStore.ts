import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  AgentMessage,
  AgentType,
  TaskPlan,
  TaskStatus,
  RouteDecision,
  PendingApproval,
  ToolCall,
} from "@/types/agent.types";
import { TASK_STATUS } from "@/types/agent.types";

interface AgentContext {
  type?: AgentType;
  folderId?: string;
  fileId?: string;
  fileName?: string;
}

interface AgentState {
  // Panel visibility
  isOpen: boolean;

  // Current conversation
  conversationId: string | null;
  messages: AgentMessage[];
  agentType: AgentType;

  // Context (from file browser or editor)
  context: AgentContext;

  // Route decision from backend
  routeDecision: RouteDecision | null;

  // Task plan (inline, associated with the current response)
  taskPlan: TaskPlan | null;

  // Pending approvals
  pendingApprovals: PendingApproval[];

  // Loading state
  isLoading: boolean;

  // Streaming state — represents an in-progress assistant response
  isStreaming: boolean;
  streamingContent: string;
  streamingToolCalls: ToolCall[];
  /** Which task step is currently being worked on */
  streamingStepId: number | null;
  /** Error that occurred during streaming */
  streamingError: string | null;

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
  setAgentType: (type: AgentType) => void;
  setContext: (ctx: AgentContext) => void;
  setRouteDecision: (decision: RouteDecision | null) => void;
  setTaskPlan: (plan: TaskPlan | null) => void;
  updateTaskStep: (
    stepId: number,
    update: { status: TaskStatus; result?: string; error?: string },
  ) => void;
  setPendingApprovals: (approvals: PendingApproval[]) => void;
  addPendingApproval: (approval: PendingApproval) => void;
  removePendingApproval: (approvalId: string) => void;
  openInDocumentContext: (fileId: string, fileName?: string) => void;

  // Streaming actions
  setStreaming: (streaming: boolean) => void;
  appendStreamingContent: (content: string) => void;
  setStreamingContent: (content: string) => void;
  addStreamingToolCall: (tc: ToolCall) => void;
  updateLastStreamingToolCall: (update: Partial<ToolCall>) => void;
  setStreamingStepId: (stepId: number | null) => void;
  setStreamingError: (error: string | null) => void;
  clearStreamingState: () => void;

  /**
   * Finalize streaming: convert streaming state into a proper assistant message
   * and clear streaming buffers
   */
  finalizeStreaming: (finalMessage?: AgentMessage) => void;
}

export const useAgentStore = create<AgentState>()(
  devtools(
    (set, get) => ({
      isOpen: false,
      conversationId: null,
      messages: [],
      agentType: "drive",
      context: {},
      routeDecision: null,
      taskPlan: null,
      pendingApprovals: [],
      isLoading: false,

      // Streaming defaults
      isStreaming: false,
      streamingContent: "",
      streamingToolCalls: [],
      streamingStepId: null,
      streamingError: null,

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),

      setConversationId: (id) => set({ conversationId: id }),
      addMessage: (message) =>
        set((s) => ({ messages: [...s.messages, message] })),
      setMessages: (messages) => set({ messages }),
      clearMessages: () =>
        set({
          messages: [],
          conversationId: null,
          taskPlan: null,
          routeDecision: null,
        }),
      setLoading: (loading) => set({ isLoading: loading }),
      newConversation: () =>
        set({
          conversationId: null,
          messages: [],
          taskPlan: null,
          routeDecision: null,
          pendingApprovals: [],
          agentType: "drive",
          isStreaming: false,
          streamingContent: "",
          streamingToolCalls: [],
          streamingStepId: null,
          streamingError: null,
        }),

      setAgentType: (type) => set({ agentType: type }),
      setContext: (ctx) => set({ context: ctx }),
      setRouteDecision: (decision) => set({ routeDecision: decision }),
      setTaskPlan: (plan) => set({ taskPlan: plan }),
      updateTaskStep: (stepId, update) =>
        set((s) => {
          if (!s.taskPlan) return {};
          const steps = s.taskPlan.steps.map((step) =>
            step.id === stepId ? { ...step, ...update } : step,
          );
          const allDone = steps.every(
            (st) =>
              st.status === TASK_STATUS.COMPLETED ||
              st.status === TASK_STATUS.FAILED ||
              st.status === TASK_STATUS.SKIPPED,
          );
          return {
            taskPlan: {
              ...s.taskPlan,
              steps,
              currentStep: allDone
                ? steps.length
                : Math.max(s.taskPlan.currentStep, stepId),
              isComplete: allDone,
            },
          };
        }),
      setPendingApprovals: (approvals) => set({ pendingApprovals: approvals }),
      addPendingApproval: (approval) =>
        set((s) => ({
          pendingApprovals: [...s.pendingApprovals, approval],
        })),
      removePendingApproval: (approvalId) =>
        set((s) => ({
          pendingApprovals: s.pendingApprovals.filter(
            (a) => a.approvalId !== approvalId,
          ),
        })),

      openInDocumentContext: (fileId, fileName) =>
        set({
          isOpen: true,
          context: { type: "document", fileId, fileName },
          agentType: "document",
        }),

      // Streaming actions
      setStreaming: (streaming) => set({ isStreaming: streaming }),
      appendStreamingContent: (content) =>
        set((s) => ({ streamingContent: s.streamingContent + content })),
      setStreamingContent: (content) => set({ streamingContent: content }),
      addStreamingToolCall: (tc) =>
        set((s) => ({
          streamingToolCalls: [...s.streamingToolCalls, tc],
        })),
      updateLastStreamingToolCall: (update) =>
        set((s) => {
          const calls = [...s.streamingToolCalls];
          if (calls.length > 0) {
            calls[calls.length - 1] = {
              ...calls[calls.length - 1],
              ...update,
            };
          }
          return { streamingToolCalls: calls };
        }),
      setStreamingStepId: (stepId) => set({ streamingStepId: stepId }),
      setStreamingError: (error) => set({ streamingError: error }),
      clearStreamingState: () =>
        set({
          isStreaming: false,
          streamingContent: "",
          streamingToolCalls: [],
          streamingStepId: null,
          streamingError: null,
        }),

      finalizeStreaming: (finalMessage) => {
        const state = get();
        if (finalMessage) {
          set((s) => ({
            messages: [...s.messages, finalMessage],
            isStreaming: false,
            isLoading: false,
            streamingContent: "",
            streamingToolCalls: [],
            streamingStepId: null,
            streamingError: null,
          }));
        } else if (state.streamingError) {
          set((s) => ({
            messages: [
              ...s.messages,
              {
                role: "assistant" as const,
                content: `Sorry, an error occurred: ${s.streamingError}. Please try again.`,
                timestamp: new Date().toISOString(),
              },
            ],
            isStreaming: false,
            isLoading: false,
            streamingContent: "",
            streamingToolCalls: [],
            streamingStepId: null,
            streamingError: null,
          }));
        } else if (state.streamingContent || state.streamingToolCalls.length) {
          set((s) => ({
            messages: [
              ...s.messages,
              {
                role: "assistant" as const,
                content: s.streamingContent || "Done.",
                toolCalls:
                  s.streamingToolCalls.length > 0
                    ? s.streamingToolCalls
                    : undefined,
                timestamp: new Date().toISOString(),
              },
            ],
            isStreaming: false,
            isLoading: false,
            streamingContent: "",
            streamingToolCalls: [],
            streamingStepId: null,
            streamingError: null,
          }));
        }
      },
    }),
    { name: "agent-store" },
  ),
);
