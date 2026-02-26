/**
 * Background Tasks Store — tracks agent tasks running in the background
 * when the user switches to a new conversation or closes the panel.
 *
 * Each task carries its own streaming state so it can be re-attached
 * to the main AgentStore when the user returns.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  AgentMessage,
  AgentType,
  TaskPlan,
  PendingApproval,
  ToolCall,
  TraceEntry,
  RouteDecision,
} from "@/types/agent.types";

export interface BackgroundTask {
  taskId: string;
  conversationId: string | null;
  userMessage: string;
  agentType: AgentType;
  status: "running" | "waiting_approval" | "completed" | "error";

  // Accumulated state
  messages: AgentMessage[];
  streamingContent: string;
  streamingToolCalls: ToolCall[];
  taskPlan: TaskPlan | null;
  pendingApprovals: PendingApproval[];
  traceEntries: TraceEntry[];
  routeDecision: RouteDecision | null;
  streamingStepId: number | null;
  streamingError: string | null;
  taskTokens: number;
  tokenWarning: boolean;
  tokenExceeded: boolean;
  tokenExceededReason: string | null;

  startedAt: number;
}

interface BackgroundTasksState {
  tasks: Record<string, BackgroundTask>;

  addTask: (task: BackgroundTask) => void;
  updateTask: (taskId: string, update: Partial<BackgroundTask>) => void;
  removeTask: (taskId: string) => void;
  clearCompleted: () => void;
}

export const useBackgroundTasksStore = create<BackgroundTasksState>()(
  devtools(
    (set) => ({
      tasks: {},

      addTask: (task) =>
        set((s) => ({
          tasks: { ...s.tasks, [task.taskId]: task },
        })),

      updateTask: (taskId, update) =>
        set((s) => {
          const existing = s.tasks[taskId];
          if (!existing) return {};
          return {
            tasks: { ...s.tasks, [taskId]: { ...existing, ...update } },
          };
        }),

      removeTask: (taskId) =>
        set((s) => {
          const { [taskId]: _, ...rest } = s.tasks;
          return { tasks: rest };
        }),

      clearCompleted: () =>
        set((s) => {
          const tasks: Record<string, BackgroundTask> = {};
          for (const [id, task] of Object.entries(s.tasks)) {
            if (
              task.status === "running" ||
              task.status === "waiting_approval"
            ) {
              tasks[id] = task;
            }
          }
          return { tasks };
        }),
    }),
    { name: "background-tasks-store" },
  ),
);

export function getBackgroundTaskByConversationId(
  convId: string,
): BackgroundTask | undefined {
  return Object.values(useBackgroundTasksStore.getState().tasks).find(
    (t) => t.conversationId === convId,
  );
}

export function getActiveBackgroundTasks(): BackgroundTask[] {
  return Object.values(useBackgroundTasksStore.getState().tasks).filter(
    (t) => t.status === "running" || t.status === "waiting_approval",
  );
}
