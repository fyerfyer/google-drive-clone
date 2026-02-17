import { cn } from "@/lib/utils";
import { IconUser, IconRobot } from "@tabler/icons-react";
import type { AgentMessage as AgentMessageType } from "@/types/agent.types";
import { AgentToolCall } from "./AgentToolCall";

interface AgentMessageProps {
  message: AgentMessageType;
}

export function AgentMessage({ message }: AgentMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 py-3", isUser ? "justify-end" : "")}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <IconRobot className="size-4" />
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-1 max-w-[85%]",
          isUser ? "items-end" : "",
        )}
      >
        {/* Tool calls (shown before the message text for assistant) */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="w-full space-y-1">
            {message.toolCalls.map((tc, i) => (
              <AgentToolCall key={`${tc.toolName}-${i}`} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Message content */}
        <div
          className={cn(
            "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {message.content}
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground px-1">
          {formatTime(message.timestamp)}
        </span>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <IconUser className="size-4" />
        </div>
      )}
    </div>
  );
}

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
