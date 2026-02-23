import { IconTrash, IconMessage, IconLoader2 } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/types/agent.types";
import { AgentTypeBadge } from "./AgentTypeBadge";

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

  return (
    <div className="space-y-0.5">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={cn(
            "group flex items-center gap-2 rounded-md px-2 py-2 text-xs cursor-pointer hover:bg-muted transition-colors",
            currentId === conv.id && "bg-muted",
          )}
          onClick={() => onSelect(conv.id)}
        >
          <IconMessage className="size-3.5 shrink-0 text-muted-foreground" />
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
      ))}
    </div>
  );
}
