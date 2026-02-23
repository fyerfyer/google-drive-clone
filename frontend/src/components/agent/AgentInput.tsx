import { useState, useRef, type KeyboardEvent } from "react";
import { IconSend, IconLoader2 } from "@tabler/icons-react";
import type { AgentType } from "@/types/agent.types";
import { useAgentStore } from "@/stores/useAgentStore";
import { AgentTypeBadge } from "./AgentTypeBadge";

interface AgentInputProps {
  onSend: (message: string, contextType?: AgentType) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function AgentInput({ onSend, isLoading, disabled }: AgentInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const context = useAgentStore((s) => s.context);

  const handleSend = () => {
    if (!text.trim() || isLoading || disabled) return;
    onSend(text, context.type);
    setText("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  };

  return (
    <div className="border-t bg-background">
      {/* Context indicator */}
      {context.type && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <AgentTypeBadge type={context.type} size="sm" />
          {context.fileName && (
            <span className="text-[10px] text-muted-foreground truncate">
              {context.fileName}
            </span>
          )}
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={
            disabled
              ? "AI Agent is not configured..."
              : context.type === "document"
                ? "Ask about this document..."
                : context.type === "drive"
                  ? "Ask about this folder..."
                  : "Ask the AI assistant..."
          }
          disabled={isLoading || disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 max-h-[120px]"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || isLoading || disabled}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconSend className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
