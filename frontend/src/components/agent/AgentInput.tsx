import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import {
  IconSend,
  IconLoader2,
  IconPaperclip,
  IconX,
  IconFileText,
  IconFolder,
} from "@tabler/icons-react";
import type { AgentType } from "@/types/agent.types";
import { useAgentStore } from "@/stores/useAgentStore";
import { AgentTypeBadge } from "./AgentTypeBadge";
import { ResourceAttachmentPicker } from "./ResourceAttachmentPicker";
import { cn } from "@/lib/utils";

interface AgentInputProps {
  onSend: (message: string, contextType?: AgentType) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function AgentInput({ onSend, isLoading, disabled }: AgentInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const context = useAgentStore((s) => s.context);
  const resourceAttachments = useAgentStore((s) => s.resourceAttachments);
  const removeResourceAttachment = useAgentStore(
    (s) => s.removeResourceAttachment,
  );
  const clearResourceAttachments = useAgentStore(
    (s) => s.clearResourceAttachments,
  );

  // @ mention popup state
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionMenuIndex, setMentionMenuIndex] = useState(0);
  const mentionMenuRef = useRef<HTMLDivElement>(null);

  // Resource picker modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"file" | "folder">("file");

  // Drag-drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const mentionOptions = [
    {
      key: "file" as const,
      label: "File",
      description: "Attach a file as context",
      icon: IconFileText,
      color: "text-emerald-500",
    },
    {
      key: "folder" as const,
      label: "Folder",
      description: "Attach a folder structure",
      icon: IconFolder,
      color: "text-blue-500",
    },
  ];

  const handleSend = () => {
    if (!text.trim() || isLoading || disabled) return;
    onSend(text, context.type);
    setText("");
    setShowMentionMenu(false);
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle mention menu navigation
    if (showMentionMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionMenuIndex((i) => (i + 1) % mentionOptions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionMenuIndex(
          (i) => (i - 1 + mentionOptions.length) % mentionOptions.length,
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleMentionSelect(mentionOptions[mentionMenuIndex].key);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (value: string) => {
    setText(value);

    // Detect '@' trigger: check if the character just typed is '@'
    // and it's either at the very start or preceded by a space/newline
    const textarea = textareaRef.current;
    if (textarea) {
      const cursorPos = textarea.selectionStart;
      const charBefore = value[cursorPos - 1];
      const charBeforeThat = cursorPos >= 2 ? value[cursorPos - 2] : " ";

      if (
        charBefore === "@" &&
        (charBeforeThat === " " || charBeforeThat === "\n" || cursorPos === 1)
      ) {
        setShowMentionMenu(true);
        setMentionMenuIndex(0);
      } else if (showMentionMenu) {
        // If we're showing the menu but the user typed something else, close it
        // Only close if the character after '@' isn't part of a valid completion
        const textAfterAt = value.slice(
          value.lastIndexOf("@", cursorPos - 1) + 1,
          cursorPos,
        );
        const validPrefixes = [
          "",
          "f",
          "fi",
          "fil",
          "file",
          "fo",
          "fol",
          "fold",
          "folde",
          "folder",
        ];
        if (!validPrefixes.includes(textAfterAt.toLowerCase())) {
          setShowMentionMenu(false);
        }
      }
    }
  };

  const handleMentionSelect = (type: "file" | "folder") => {
    setShowMentionMenu(false);
    // Remove the '@' (and any partial text after it) from the input
    const textarea = textareaRef.current;
    if (textarea) {
      const cursorPos = textarea.selectionStart;
      const atPos = text.lastIndexOf("@", cursorPos - 1);
      if (atPos !== -1) {
        const newText = text.slice(0, atPos) + text.slice(cursorPos);
        setText(newText);
      }
    }
    // Open the resource picker in the selected mode
    setPickerMode(type);
    setPickerOpen(true);
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  };

  // Close mention menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        mentionMenuRef.current &&
        !mentionMenuRef.current.contains(e.target as Node)
      ) {
        setShowMentionMenu(false);
      }
    };
    if (showMentionMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMentionMenu]);

  // Drag-drop handlers for attaching drive resources
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    // Check if drag contains internal drive items (via text/plain with JSON data)
    if (e.dataTransfer.types.includes("text/plain")) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    // Try to parse dropped drive item data
    const textData = e.dataTransfer.getData("text/plain");
    if (textData) {
      try {
        const item = JSON.parse(textData);
        if (item.id && item.name && item.type) {
          const uri =
            item.type === "folder"
              ? `drive://folders/${item.id}`
              : `drive://files/${item.id}`;
          useAgentStore.getState().addResourceAttachment({
            uri,
            name: item.name,
            type: item.type,
            id: item.id,
          });
        }
      } catch {
        // Not valid JSON, ignore
      }
    }
  };

  const hasAttachments = resourceAttachments.length > 0;

  return (
    <div
      className={cn(
        "border-t bg-background transition-colors",
        isDragOver && "bg-primary/5 border-t-primary/30",
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
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

      {/* Attachment chips */}
      {hasAttachments && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
          {resourceAttachments.map((attachment) => (
            <div
              key={attachment.uri}
              className="group flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-[11px] animate-in fade-in slide-in-from-bottom-1 duration-200"
            >
              {attachment.type === "folder" ? (
                <IconFolder className="size-3 shrink-0 text-blue-500" />
              ) : (
                <IconFileText className="size-3 shrink-0 text-emerald-500" />
              )}
              <span className="truncate max-w-[120px]">{attachment.name}</span>
              <button
                onClick={() => removeResourceAttachment(attachment.uri)}
                className="shrink-0 rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-muted transition-all"
                title="Remove attachment"
              >
                <IconX className="size-2.5" />
              </button>
            </div>
          ))}
          {resourceAttachments.length > 1 && (
            <button
              onClick={clearResourceAttachments}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Drag overlay hint */}
      {isDragOver && (
        <div className="flex items-center justify-center gap-2 px-3 py-2 text-xs text-primary font-medium animate-in fade-in duration-150">
          <IconPaperclip className="size-3.5" />
          Drop to attach as context
        </div>
      )}

      <div className="relative flex items-end gap-2 p-3">
        {/* @ mention popup */}
        {showMentionMenu && (
          <div
            ref={mentionMenuRef}
            className="absolute bottom-full left-3 mb-1 w-56 rounded-lg border bg-popover shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150 z-10"
          >
            <div className="p-1">
              <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Attach Resource
              </div>
              {mentionOptions.map((option, idx) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.key}
                    onClick={() => handleMentionSelect(option.key)}
                    onMouseEnter={() => setMentionMenuIndex(idx)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
                      idx === mentionMenuIndex
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50",
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md bg-muted",
                        option.color,
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{option.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Paperclip / attach button */}
        <button
          onClick={() => {
            setPickerMode("file");
            setPickerOpen(true);
          }}
          disabled={isLoading || disabled}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Attach file or folder (or type @)"
        >
          <IconPaperclip className="size-4" />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={
            disabled
              ? "AI Agent is not configured..."
              : context.type === "document"
                ? "Ask about this document... (type @ to attach)"
                : context.type === "drive"
                  ? "Ask about this folder... (type @ to attach)"
                  : "Ask the AI assistant... (type @ to attach)"
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

      {/* Resource Attachment Picker Modal */}
      <ResourceAttachmentPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode={pickerMode}
      />
    </div>
  );
}
