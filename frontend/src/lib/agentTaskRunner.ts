/**
 * Agent Task Runner — singleton that manages SSE connections independently
 * of React component lifecycle. Each task's events are routed to either
 * the main AgentStore (attached, i.e. currently viewed) or the
 * BackgroundTasksStore (detached, running in background).
 */

import { agentService } from "@/services/agent.service";
import { useAgentStore } from "@/stores/useAgentStore";
import {
  useBackgroundTasksStore,
  type BackgroundTask,
} from "@/stores/useBackgroundTasksStore";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryClient";
import type {
  AgentMessage,
  AgentStreamEvent,
  AgentType,
  TraceEntry,
} from "@/types/agent.types";
import { AGENT_EVENT_TYPE, TASK_STATUS } from "@/types/agent.types";
import { toast } from "sonner";
import { saveTracesToCache } from "@/lib/traceCache";

/* ─── Internal Types ──────────────────────────────────────────── */

interface ActiveTask {
  taskId: string;
  conversationId: string | null;
  abortController: AbortController;
  /** true = events route to main AgentStore; false = background store */
  isAttached: boolean;
}

const activeTasks = new Map<string, ActiveTask>();

/* ─── Public API ──────────────────────────────────────────────── */

export const agentTaskRunner = {
  /** Start SSE stream for a task (fire-and-forget). */
  start(taskId: string, conversationId: string | null, attached = true) {
    const ac = new AbortController();
    const task: ActiveTask = {
      taskId,
      conversationId,
      abortController: ac,
      isAttached: attached,
    };
    activeTasks.set(taskId, task);
    runSSE(task).catch(() => {});
  },

  /** Detach a task from the main store → events go to background store. */
  detach(taskId: string) {
    const task = activeTasks.get(taskId);
    if (task) task.isAttached = false;
  },

  /** Re-attach a background task → events go to main AgentStore. */
  attach(taskId: string) {
    const task = activeTasks.get(taskId);
    if (task) task.isAttached = true;
  },

  /** Abort a task's SSE connection. */
  abort(taskId: string) {
    const task = activeTasks.get(taskId);
    if (task) {
      task.abortController.abort();
      activeTasks.delete(taskId);
    }
  },

  isRunning(taskId: string): boolean {
    return activeTasks.has(taskId);
  },

  getByConversationId(convId: string): ActiveTask | undefined {
    for (const t of activeTasks.values()) {
      if (t.conversationId === convId) return t;
    }
    return undefined;
  },
};

/* ─── SSE Lifecycle ───────────────────────────────────────────── */

async function runSSE(task: ActiveTask) {
  try {
    await agentService.streamTaskEvents(
      task.taskId,
      (event) => {
        const current = activeTasks.get(task.taskId);
        if (!current) return;
        if (current.isAttached) {
          handleMainStoreEvent(event, task.taskId);
        } else {
          handleBackgroundEvent(event, task.taskId);
        }
      },
      task.abortController.signal,
    );
    // Stream ended normally
    onStreamEnd(task.taskId);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      activeTasks.delete(task.taskId);
      return;
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    onStreamError(task.taskId, msg);
  } finally {
    activeTasks.delete(task.taskId);
  }
}

function onStreamEnd(taskId: string) {
  const task = activeTasks.get(taskId);
  if (!task) return;
  if (task.isAttached) {
    const s = useAgentStore.getState();
    if (s.isStreaming) s.finalizeStreaming();
  } else {
    const bg = useBackgroundTasksStore.getState();
    const t = bg.tasks[taskId];
    if (t && (t.status === "running" || t.status === "waiting_approval")) {
      finalizeBackgroundTask(taskId);
    }
  }
}

function onStreamError(taskId: string, errMsg: string) {
  const task = activeTasks.get(taskId);
  if (!task) return;

  if (task.isAttached) {
    const s = useAgentStore.getState();
    s.setStreamingError(errMsg);
    s.finalizeStreaming();
  } else {
    const bg = useBackgroundTasksStore.getState();
    const t = bg.tasks[taskId];
    if (t) {
      bg.updateTask(taskId, {
        status: "error",
        streamingError: errMsg,
        messages: [
          ...t.messages,
          {
            role: "assistant" as const,
            content: `Sorry, an error occurred: ${errMsg}. Please try again.`,
            timestamp: new Date().toISOString(),
          },
        ],
        streamingContent: "",
        streamingToolCalls: [],
      });
    }
  }
}

function finalizeBackgroundTask(taskId: string) {
  const bg = useBackgroundTasksStore.getState();
  const t = bg.tasks[taskId];
  if (!t) return;

  // Persist traces before clearing streaming state
  if (t.conversationId && t.traceEntries.length > 0) {
    saveTracesToCache(t.conversationId, t.traceEntries);
  }

  const finalMsg: AgentMessage = {
    role: "assistant",
    content: t.streamingError
      ? `Sorry, an error occurred: ${t.streamingError}. Please try again.`
      : t.streamingContent || "Done.",
    toolCalls:
      t.streamingToolCalls.length > 0 ? t.streamingToolCalls : undefined,
    timestamp: new Date().toISOString(),
  };

  bg.updateTask(taskId, {
    status: t.streamingError ? "error" : "completed",
    messages: [...t.messages, finalMsg],
    streamingContent: "",
    streamingToolCalls: [],
  });

  toast.success("Background task completed", {
    description: t.userMessage.slice(0, 100),
    duration: 5000,
  });

  // Refresh data
  queryClient.invalidateQueries({ queryKey: ["agent-conversations"] });
  queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
}

/* ─── Attached (main store) event dispatcher ──────────────────── */

function handleMainStoreEvent(event: AgentStreamEvent, taskId: string) {
  const s = useAgentStore.getState();
  const activeTask = activeTasks.get(taskId);

  switch (event.type) {
    case AGENT_EVENT_TYPE.ROUTE_DECISION: {
      const d = event.data as {
        agentType: AgentType;
        confidence: number;
        source: string;
        reason: string;
      };
      s.setAgentType(d.agentType);
      s.setRouteDecision({
        confidence: d.confidence,
        source: d.source as
          | "explicit"
          | "conversation"
          | "pattern"
          | "llm"
          | "default",
        reason: d.reason,
      });
      break;
    }
    case AGENT_EVENT_TYPE.TASK_PLAN:
      s.setTaskPlan((event.data as { plan: any }).plan);
      break;

    case AGENT_EVENT_TYPE.PARALLEL_BATCH: {
      const d = event.data as { stepIds: number[] };
      s.addParallelBatch({ stepIds: d.stepIds, timestamp: Date.now() });
      break;
    }

    case AGENT_EVENT_TYPE.TASK_STEP_UPDATE: {
      const d = event.data as {
        stepId: number;
        status: string;
        result?: string;
        error?: string;
      };
      s.updateTaskStep(d.stepId, {
        status: d.status as any,
        result: d.result,
        error: d.error,
      });
      if (d.status === TASK_STATUS.IN_PROGRESS) s.setStreamingStepId(d.stepId);
      break;
    }
    case AGENT_EVENT_TYPE.TOOL_CALL_START: {
      const d = event.data as {
        toolName: string;
        args: Record<string, unknown>;
      };
      s.addStreamingToolCall({ toolName: d.toolName, args: d.args });
      break;
    }
    case AGENT_EVENT_TYPE.TOOL_CALL_END: {
      const d = event.data as {
        result: string;
        isError: boolean;
      };
      s.updateLastStreamingToolCall({ result: d.result, isError: d.isError });
      break;
    }
    case AGENT_EVENT_TYPE.CONTENT:
      s.appendStreamingContent((event.data as { content: string }).content);
      break;

    case AGENT_EVENT_TYPE.APPROVAL_NEEDED: {
      const d = event.data as {
        approvalId: string;
        toolName: string;
        reason: string;
        args: Record<string, unknown>;
      };
      s.addPendingApproval({
        approvalId: d.approvalId,
        toolName: d.toolName,
        reason: d.reason,
        args: d.args,
      });
      break;
    }
    case AGENT_EVENT_TYPE.APPROVAL_RESOLVED:
      s.removePendingApproval(
        (event.data as { approvalId: string }).approvalId,
      );
      break;

    case AGENT_EVENT_TYPE.TOKEN_UPDATE: {
      const d = event.data as {
        taskTokens: number;
        warning?: boolean;
        exceeded?: boolean;
        reason?: string;
      };
      s.setTaskTokens(d.taskTokens);
      if (d.warning !== undefined) s.setTokenWarning(d.warning);
      if (d.exceeded) s.setTokenExceeded(true, d.reason);
      break;
    }
    case AGENT_EVENT_TYPE.TRACE:
      s.addTraceEntry(event.data as unknown as TraceEntry);
      break;

    case AGENT_EVENT_TYPE.DONE: {
      const d = event.data as any;
      if (d.conversationId) {
        s.setConversationId(d.conversationId);
        if (activeTask) activeTask.conversationId = d.conversationId;
      }
      if (d.agentType) s.setAgentType(d.agentType);
      if (d.taskPlan) s.setTaskPlan(d.taskPlan);
      if (d.message) s.finalizeStreaming(d.message);
      else s.finalizeStreaming();

      // Persist traces so the user can view them after leaving and returning
      const convId = d.conversationId ?? activeTask?.conversationId;
      if (convId) {
        const freshTraces = useAgentStore.getState().traceEntries;
        saveTracesToCache(convId, freshTraces);
      }

      queryClient.invalidateQueries({ queryKey: ["agent-conversations"] });
      break;
    }
    case AGENT_EVENT_TYPE.ERROR: {
      s.setStreamingError((event.data as { message: string }).message);
      s.finalizeStreaming();
      break;
    }
  }
}

/* ─── Detached (background store) event dispatcher ────────────── */

function handleBackgroundEvent(event: AgentStreamEvent, taskId: string) {
  const bgStore = useBackgroundTasksStore.getState();
  const task = bgStore.tasks[taskId];
  if (!task) return;
  const activeTask = activeTasks.get(taskId);

  switch (event.type) {
    case AGENT_EVENT_TYPE.ROUTE_DECISION: {
      const d = event.data as {
        agentType: AgentType;
        confidence: number;
        source: string;
        reason: string;
      };
      bgStore.updateTask(taskId, {
        agentType: d.agentType,
        routeDecision: {
          confidence: d.confidence,
          source: d.source as any,
          reason: d.reason,
        },
      });
      break;
    }
    case AGENT_EVENT_TYPE.TASK_PLAN:
      bgStore.updateTask(taskId, {
        taskPlan: (event.data as { plan: any }).plan,
      });
      break;

    case AGENT_EVENT_TYPE.PARALLEL_BATCH:
      // Background tasks: no-op for now (parallel batches tracked only in foreground)
      break;

    case AGENT_EVENT_TYPE.TASK_STEP_UPDATE: {
      const d = event.data as {
        stepId: number;
        status: string;
        result?: string;
        error?: string;
      };
      // Re-read fresh task for step update
      const fresh = useBackgroundTasksStore.getState().tasks[taskId];
      if (fresh?.taskPlan) {
        const steps = fresh.taskPlan.steps.map((s) =>
          s.id === d.stepId
            ? {
                ...s,
                status: d.status as any,
                result: d.result,
                error: d.error,
              }
            : s,
        );
        const allDone = steps.every(
          (st) =>
            st.status === TASK_STATUS.COMPLETED ||
            st.status === TASK_STATUS.FAILED ||
            st.status === TASK_STATUS.SKIPPED,
        );
        bgStore.updateTask(taskId, {
          taskPlan: {
            ...fresh.taskPlan,
            steps,
            currentStep: allDone
              ? steps.length
              : Math.max(fresh.taskPlan.currentStep, d.stepId),
            isComplete: allDone,
          },
          streamingStepId:
            d.status === TASK_STATUS.IN_PROGRESS
              ? d.stepId
              : fresh.streamingStepId,
        });
      }
      break;
    }
    case AGENT_EVENT_TYPE.TOOL_CALL_START: {
      const d = event.data as {
        toolName: string;
        args: Record<string, unknown>;
      };
      const fresh = useBackgroundTasksStore.getState().tasks[taskId];
      if (fresh) {
        bgStore.updateTask(taskId, {
          streamingToolCalls: [
            ...fresh.streamingToolCalls,
            { toolName: d.toolName, args: d.args },
          ],
        });
      }
      break;
    }
    case AGENT_EVENT_TYPE.TOOL_CALL_END: {
      const d = event.data as { result: string; isError: boolean };
      const fresh = useBackgroundTasksStore.getState().tasks[taskId];
      if (fresh) {
        const calls = [...fresh.streamingToolCalls];
        if (calls.length > 0) {
          calls[calls.length - 1] = {
            ...calls[calls.length - 1],
            result: d.result,
            isError: d.isError,
          };
        }
        bgStore.updateTask(taskId, { streamingToolCalls: calls });
      }
      break;
    }
    case AGENT_EVENT_TYPE.CONTENT: {
      const fresh = useBackgroundTasksStore.getState().tasks[taskId];
      if (fresh) {
        bgStore.updateTask(taskId, {
          streamingContent:
            fresh.streamingContent +
            (event.data as { content: string }).content,
        });
      }
      break;
    }
    case AGENT_EVENT_TYPE.APPROVAL_NEEDED: {
      const d = event.data as {
        approvalId: string;
        toolName: string;
        reason: string;
        args: Record<string, unknown>;
      };
      const fresh = useBackgroundTasksStore.getState().tasks[taskId];
      if (fresh) {
        bgStore.updateTask(taskId, {
          status: "waiting_approval",
          pendingApprovals: [
            ...fresh.pendingApprovals,
            {
              approvalId: d.approvalId,
              toolName: d.toolName,
              reason: d.reason,
              args: d.args,
            },
          ],
        });

        // Persistent toast with "Open Chat" action
        toast.warning(`Approval needed: ${d.toolName}`, {
          description: d.reason,
          duration: 60_000,
          action: {
            label: "Open Chat",
            onClick: () => {
              const convId =
                useBackgroundTasksStore.getState().tasks[taskId]
                  ?.conversationId;
              window.dispatchEvent(
                new CustomEvent("agent:goto-conversation", {
                  detail: { conversationId: convId, taskId },
                }),
              );
            },
          },
        });
      }
      break;
    }
    case AGENT_EVENT_TYPE.APPROVAL_RESOLVED: {
      const d = event.data as { approvalId: string };
      const fresh = useBackgroundTasksStore.getState().tasks[taskId];
      if (fresh) {
        const remaining = fresh.pendingApprovals.filter(
          (a) => a.approvalId !== d.approvalId,
        );
        bgStore.updateTask(taskId, {
          status: remaining.length > 0 ? "waiting_approval" : "running",
          pendingApprovals: remaining,
        });
      }
      break;
    }
    case AGENT_EVENT_TYPE.TOKEN_UPDATE: {
      const d = event.data as {
        taskTokens: number;
        warning?: boolean;
        exceeded?: boolean;
        reason?: string;
      };
      bgStore.updateTask(taskId, {
        taskTokens: d.taskTokens,
        tokenWarning: d.warning ?? false,
        tokenExceeded: d.exceeded ?? false,
        tokenExceededReason: d.reason ?? null,
      });
      break;
    }
    case AGENT_EVENT_TYPE.TRACE: {
      const fresh = useBackgroundTasksStore.getState().tasks[taskId];
      if (fresh) {
        bgStore.updateTask(taskId, {
          traceEntries: [
            ...fresh.traceEntries,
            event.data as unknown as TraceEntry,
          ],
        });
      }
      break;
    }
    case AGENT_EVENT_TYPE.DONE: {
      const d = event.data as any;
      const fresh = useBackgroundTasksStore.getState().tasks[taskId];
      if (!fresh) break;

      const finalMsg: AgentMessage = d.message || {
        role: "assistant" as const,
        content: fresh.streamingContent || "Done.",
        toolCalls:
          fresh.streamingToolCalls.length > 0
            ? fresh.streamingToolCalls
            : undefined,
        timestamp: new Date().toISOString(),
      };

      bgStore.updateTask(taskId, {
        status: "completed",
        conversationId: d.conversationId || fresh.conversationId,
        agentType: d.agentType || fresh.agentType,
        taskPlan: d.taskPlan || fresh.taskPlan,
        messages: [...fresh.messages, finalMsg],
        streamingContent: "",
        streamingToolCalls: [],
        streamingError: null,
      });
      if (activeTask) {
        activeTask.conversationId = d.conversationId || fresh.conversationId;
      }

      toast.success("Background task completed", {
        description: fresh.userMessage.slice(0, 100),
        duration: 5000,
      });

      queryClient.invalidateQueries({ queryKey: ["agent-conversations"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      break;
    }
    case AGENT_EVENT_TYPE.ERROR: {
      const d = event.data as { message: string };
      const fresh = useBackgroundTasksStore.getState().tasks[taskId];
      if (fresh) {
        bgStore.updateTask(taskId, {
          status: "error",
          streamingError: d.message,
          messages: [
            ...fresh.messages,
            {
              role: "assistant" as const,
              content: `Sorry, an error occurred: ${d.message}. Please try again.`,
              timestamp: new Date().toISOString(),
            },
          ],
          streamingContent: "",
          streamingToolCalls: [],
        });
      }
      break;
    }
  }
}

/* ─── Utility: detach / attach helpers (used by useAgent hook) ─── */

/**
 * Snapshot the current main AgentStore state and move the active task
 * to background. Call this before switching conversations.
 */
export function detachCurrentTask(): void {
  const s = useAgentStore.getState();
  const taskId = s.currentTaskId;
  if (!taskId) return;
  if (!agentTaskRunner.isRunning(taskId)) return;

  // Build background task from current state
  const lastUserMsg =
    [...s.messages].reverse().find((m) => m.role === "user")?.content || "";

  const snapshot: BackgroundTask = {
    taskId,
    conversationId: s.conversationId,
    userMessage: lastUserMsg,
    agentType: s.agentType,
    status: s.pendingApprovals.length > 0 ? "waiting_approval" : "running",
    messages: [...s.messages],
    streamingContent: s.streamingContent,
    streamingToolCalls: [...s.streamingToolCalls],
    taskPlan: s.taskPlan,
    pendingApprovals: [...s.pendingApprovals],
    traceEntries: [...s.traceEntries],
    routeDecision: s.routeDecision,
    streamingStepId: s.streamingStepId,
    streamingError: s.streamingError,
    taskTokens: s.taskTokens,
    tokenWarning: s.tokenWarning,
    tokenExceeded: s.tokenExceeded,
    tokenExceededReason: s.tokenExceededReason,
    startedAt: Date.now(),
  };

  useBackgroundTasksStore.getState().addTask(snapshot);
  agentTaskRunner.detach(taskId);

  // Refresh the conversation list immediately so the in-flight conversation
  // shows up in history even before DONE fires
  queryClient.invalidateQueries({ queryKey: ["agent-conversations"] });
}

/**
 * Load a background task back into the main AgentStore.
 * Returns true if a background task was found and attached.
 */
export function attachBackgroundTask(taskId: string): boolean {
  const bg = useBackgroundTasksStore.getState();
  const t = bg.tasks[taskId];
  if (!t) return false;

  const s = useAgentStore.getState();
  s.setConversationId(t.conversationId);
  s.setMessages(t.messages);
  s.setAgentType(t.agentType);
  s.setRouteDecision(t.routeDecision);
  s.setTaskPlan(t.taskPlan);
  s.setPendingApprovals(t.pendingApprovals);
  s.setCurrentTaskId(taskId);

  if (t.status === "running" || t.status === "waiting_approval") {
    // Task still in-flight — restore streaming state
    useAgentStore.setState({
      isLoading: true,
      isStreaming: true,
      streamingContent: t.streamingContent,
      streamingToolCalls: t.streamingToolCalls,
      streamingStepId: t.streamingStepId,
      streamingError: t.streamingError,
      taskTokens: t.taskTokens,
      tokenWarning: t.tokenWarning,
      tokenExceeded: t.tokenExceeded,
      tokenExceededReason: t.tokenExceededReason,
      traceEntries: t.traceEntries,
    });
    agentTaskRunner.attach(taskId);
  } else {
    // Completed or errored — persist traces then restore into main store
    if (t.conversationId && t.traceEntries.length > 0) {
      saveTracesToCache(t.conversationId, t.traceEntries);
    }
    useAgentStore.setState({
      isLoading: false,
      isStreaming: false,
      streamingContent: "",
      streamingToolCalls: [],
      streamingStepId: null,
      streamingError: null,
      traceEntries: t.traceEntries,
      taskTokens: t.taskTokens,
      tokenWarning: t.tokenWarning,
      tokenExceeded: t.tokenExceeded,
      tokenExceededReason: t.tokenExceededReason,
    });
  }

  bg.removeTask(taskId);
  return true;
}
