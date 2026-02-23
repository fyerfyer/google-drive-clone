import { cn } from "@/lib/utils";
import { IconUser, IconRobot } from "@tabler/icons-react";
import type { AgentMessage as AgentMessageType } from "@/types/agent.types";
import { AgentToolCall } from "./AgentToolCall";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AgentMessageProps {
  message: AgentMessageType;
}

export function AgentMessage({ message }: AgentMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 py-3", isUser ? "justify-end" : "")}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
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
        {isUser ? (
          <div className="rounded-xl bg-primary text-primary-foreground px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
        ) : (
          <div className="rounded-xl bg-muted text-foreground px-3.5 py-2.5 text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-pre:bg-background prose-pre:border prose-pre:text-[12px] prose-code:text-[12px] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-background prose-code:before:content-none prose-code:after:content-none prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-2 prose-table:text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground px-1">
          {formatTime(message.timestamp)}
        </span>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground mt-0.5">
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
