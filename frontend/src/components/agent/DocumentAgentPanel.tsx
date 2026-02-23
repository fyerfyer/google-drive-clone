import { useRef, useEffect, useState, useCallback } from "react";
import {
  IconX,
  IconSparkles,
  IconFileText,
  IconWand,
  IconLanguage,
  IconPencil,
  IconFileAnalytics,
  IconHistory,
  IconArrowLeft,
  IconPlus,
} from "@tabler/icons-react";
import { useAgentStore } from "@/stores/useAgentStore";
import {
  useAgentChat,
  useAgentConversations,
  useLoadConversation,
  useDeleteConversation,
  useAgentStatus,
} from "@/hooks/agent/useAgent";
import { useDocumentSocket } from "@/hooks/useSocket";
import { AgentMessage } from "./AgentMessage";
import { AgentInput } from "./AgentInput";
import { AgentConversationList } from "./AgentConversationList";
import { TaskPlanDisplay } from "./TaskPlanDisplay";
import { ApprovalList } from "./ApprovalCard";
import { StreamingResponse } from "./StreamingResponse";
import { cn } from "@/lib/utils";

interface DocumentAgentPanelProps {
  fileId: string;
  fileName: string;
  isOpen: boolean;
  onClose: () => void;
  /** Callback fired when the agent modifies the document content */
  onContentUpdate?: () => void;
}

const QUICK_ACTIONS = [
  {
    icon: IconFileAnalytics,
    label: "Summarize",
    prompt: "Summarize this document concisely",
  },
  {
    icon: IconPencil,
    label: "Polish",
    prompt: "Polish and improve the writing in this document",
  },
  {
    icon: IconLanguage,
    label: "Translate",
    prompt: "Translate this document to English",
  },
  {
    icon: IconWand,
    label: "Fix Grammar",
    prompt: "Fix any grammar and spelling errors in this document",
  },
];

const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 320;

export function DocumentAgentPanel({
  fileId,
  fileName,
  isOpen,
  onClose,
  onContentUpdate,
}: DocumentAgentPanelProps) {
  const {
    taskPlan,
    pendingApprovals,
    isStreaming,
    streamingContent,
    streamingToolCalls,
    isLoading: storeLoading,
    setContext,
  } = useAgentStore();

  const { messages, isLoading, conversationId, sendMessage, newConversation } =
    useAgentChat();
  const { data: agentStatus } = useAgentStatus();
  const { data: conversations, isLoading: conversationsLoading } =
    useAgentConversations();
  const { loadConversation } = useLoadConversation();
  const deleteConversation = useDeleteConversation();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, width: 0 });

  // Join document WebSocket room
  useDocumentSocket(isOpen ? fileId : null);

  // Set the document context when opening
  useEffect(() => {
    if (isOpen && fileId) {
      setContext({ type: "document", fileId, fileName });
    }
  }, [isOpen, fileId, fileName, setContext]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, streamingToolCalls, isStreaming]);

  // Watch for document-modifying tool calls to trigger refresh
  useEffect(() => {
    if (!onContentUpdate || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "assistant" && lastMsg.toolCalls) {
      const modifyingTools = ["write_file", "patch_file"];
      const hasModification = lastMsg.toolCalls.some(
        (tc) => modifyingTools.includes(tc.toolName) && !tc.isError,
      );
      if (hasModification) {
        // Small delay to ensure backend storage has committed
        setTimeout(() => onContentUpdate(), 500);
      }
    }
  }, [messages, onContentUpdate]);

  // ── Resize handlers ──
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      resizeStartRef.current = { x: e.clientX, width: panelWidth };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isResizingRef.current) return;
        // Dragging left increases width (panel is on the right)
        const delta = resizeStartRef.current.x - ev.clientX;
        const newWidth = Math.max(
          MIN_WIDTH,
          Math.min(MAX_WIDTH, resizeStartRef.current.width + delta),
        );
        setPanelWidth(newWidth);
      };

      const handleMouseUp = () => {
        isResizingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelWidth],
  );

  const isConfigured = agentStatus?.enabled ?? false;

  if (!isOpen) return null;

  return (
    <div
      className="relative flex h-full flex-col border-l bg-background"
      style={{ width: panelWidth }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
        onMouseDown={handleResizeStart}
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5 shrink-0">
        {showHistory ? (
          <>
            <button
              onClick={() => setShowHistory(false)}
              className="rounded-md p-1 hover:bg-muted transition-colors"
            >
              <IconArrowLeft className="size-3.5" />
            </button>
            <span className="text-xs font-semibold">Conversations</span>
          </>
        ) : (
          <>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <IconFileText className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold">Document AI</h3>
              <p className="text-[10px] text-muted-foreground truncate">
                {fileName}
              </p>
            </div>
          </>
        )}
        <div className="flex items-center gap-0.5 ml-auto">
          {!showHistory && (
            <>
              <button
                onClick={() => newConversation()}
                className="rounded-md p-1 hover:bg-muted transition-colors"
                title="New conversation"
              >
                <IconPlus className="size-3.5" />
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className="rounded-md p-1 hover:bg-muted transition-colors"
                title="History"
              >
                <IconHistory className="size-3.5" />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors"
          >
            <IconX className="size-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {showHistory ? (
          <div className="p-2">
            <AgentConversationList
              conversations={conversations || []}
              currentId={conversationId}
              onSelect={(id) => {
                loadConversation(id);
                setShowHistory(false);
              }}
              onDelete={(id) => deleteConversation.mutate(id)}
              isLoading={conversationsLoading}
            />
          </div>
        ) : (
          <div className="px-3 py-2">
            {/* Empty state with quick actions */}
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 mb-3">
                  <IconSparkles className="size-6" />
                </div>
                <h4 className="text-xs font-semibold mb-1">
                  Document Assistant
                </h4>
                <p className="text-[11px] text-muted-foreground max-w-[220px] mb-5">
                  Edit, polish, translate, or analyze this document with AI.
                </p>

                <div className="grid grid-cols-2 gap-2 w-full">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => sendMessage(action.prompt, "document")}
                      disabled={!isConfigured || isLoading}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center",
                        "hover:bg-emerald-500/5 hover:border-emerald-500/20 transition-all",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      <action.icon className="size-4 text-emerald-500" />
                      <span className="text-[11px] font-medium">
                        {action.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <AgentMessage key={`${msg.role}-${i}`} message={msg} />
            ))}

            {/* Streaming response - appears inline after the last user message */}
            {(isLoading || storeLoading || isStreaming) && (
              <StreamingResponse />
            )}

            {/* Non-streaming: show persisted task plan / approvals */}
            {!isLoading && !storeLoading && !isStreaming && (
              <>
                {taskPlan && taskPlan.steps.length > 0 && (
                  <div className="mb-2">
                    <TaskPlanDisplay plan={taskPlan} />
                  </div>
                )}
                {pendingApprovals.length > 0 && (
                  <div className="mb-2">
                    <ApprovalList approvals={pendingApprovals} />
                  </div>
                )}
              </>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {!showHistory && (
        <AgentInput
          onSend={(msg) => sendMessage(msg, "document")}
          isLoading={isLoading}
          disabled={!isConfigured}
        />
      )}
    </div>
  );
}
