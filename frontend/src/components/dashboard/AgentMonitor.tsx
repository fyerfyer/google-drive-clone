import {
  IconRobot,
  IconLoader2,
  IconCheck,
  IconX,
  IconExternalLink,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useBackgroundTasksStore,
  type BackgroundTask,
} from "@/stores/useBackgroundTasksStore";
import { useAgentStore } from "@/stores/useAgentStore";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";

function relativeTime(ts: number) {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function AgentMonitor() {
  const tasks = useBackgroundTasksStore(
    useShallow((s) => Object.values(s.tasks)),
  );
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const isLoading = useAgentStore((s) => s.isLoading);

  const activeTasks = tasks.filter(
    (t) => t.status === "running" || t.status === "waiting_approval",
  );
  const completedTasks = tasks
    .filter((t) => t.status === "completed" || t.status === "error")
    .slice(0, 3);

  const currentlyStreaming = isStreaming || isLoading;

  const goToChat = (task: BackgroundTask) => {
    useAgentStore.getState().open();
    window.dispatchEvent(
      new CustomEvent("agent:goto-conversation", {
        detail: {
          conversationId: task.conversationId ?? undefined,
          taskId: task.taskId,
        },
      }),
    );
  };

  const openAgent = () => {
    useAgentStore.getState().open();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconRobot className="size-5" />
          AI Agent
          {(activeTasks.length > 0 || currentlyStreaming) && (
            <span className="ml-auto flex items-center gap-1 text-xs font-normal text-emerald-600">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeTasks.length === 0 &&
        completedTasks.length === 0 &&
        !currentlyStreaming ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              No agent activity right now
            </p>
            <button
              onClick={openAgent}
              className="text-xs text-primary hover:underline"
            >
              Open AI Assistant
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Currently streaming in foreground */}
            {currentlyStreaming && (
              <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/10 p-3">
                <IconLoader2 className="size-4 text-primary animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">
                    Processing in current chat
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Agent is working on your request...
                  </p>
                </div>
              </div>
            )}

            {/* Background tasks */}
            {activeTasks.map((t) => (
              <div
                key={t.taskId}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                  t.status === "waiting_approval" &&
                    "border-amber-500/30 bg-amber-500/5",
                )}
                onClick={() => goToChat(t)}
              >
                {t.status === "waiting_approval" ? (
                  <IconAlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                ) : (
                  <IconLoader2 className="size-4 text-emerald-500 animate-spin shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium line-clamp-1">
                    {t.userMessage}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        t.status === "waiting_approval"
                          ? "text-amber-600"
                          : "text-emerald-600",
                      )}
                    >
                      {t.status === "waiting_approval"
                        ? `${t.pendingApprovals.length} approval(s) needed`
                        : "Running"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {relativeTime(t.startedAt)}
                    </span>
                  </div>
                </div>
                <IconExternalLink className="size-3.5 text-muted-foreground shrink-0 mt-1" />
              </div>
            ))}

            {/* Recent completions */}
            {completedTasks.map((t) => (
              <div
                key={t.taskId}
                className="flex items-center gap-3 rounded-lg border border-dashed p-2.5 opacity-60 cursor-pointer hover:opacity-100 transition-opacity"
                onClick={() => goToChat(t)}
              >
                {t.status === "completed" ? (
                  <IconCheck className="size-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <IconX className="size-3.5 text-red-500 shrink-0" />
                )}
                <p className="text-xs line-clamp-1 flex-1">{t.userMessage}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
