import { IconTrash, IconMessage, IconLoader2 } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/types/agent.types";
import { AgentTypeBadge } from "./AgentTypeBadge";
import { useBackgroundTasksStore } from "@/stores/useBackgroundTasksStore";

interface AgentConversationListProps {
  conversations: ConversationSummary[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

export function AgentConversationList({
  conversations,
  currentId,
  onSelect,
  onDelete,
  isLoading,
}: AgentConversationListProps) {
  const bgTasks = useBackgroundTasksStore((s) => s.tasks);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground">
        No conversations yet
      </div>
    );
  }

  const getRunningTask = (convId: string) =>
    Object.values(bgTasks).find(
      (t) =>
        t.conversationId === convId &&
        (t.status === "running" || t.status === "waiting_approval"),
    );

  return (
    <div className="space-y-0.5">
      {conversations.map((conv) => {
        const runningTask = getRunningTask(conv.id);
        return (
          <div
            key={conv.id}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-2 text-xs cursor-pointer hover:bg-muted transition-colors",
              currentId === conv.id && "bg-muted",
              runningTask && "border-l-2 border-primary",
            )}
            onClick={() => onSelect(conv.id)}
          >
            {runningTask ? (
              <IconLoader2 className="size-3.5 shrink-0 text-primary animate-spin" />
            ) : (
              <IconMessage className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate font-medium">{conv.title}</p>
                {conv.agentType && (
                  <AgentTypeBadge
                    type={conv.agentType}
                    size="sm"
                    showLabel={false}
                  />
                )}
                {runningTask && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                    {runningTask.status === "waiting_approval"
                      ? "Needs approval"
                      : "Running"}
                  </span>
                )}
              </div>
              <p className="truncate text-muted-foreground">
                {conv.lastMessage || `${conv.messageCount} messages`}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
            >
              <IconTrash className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
