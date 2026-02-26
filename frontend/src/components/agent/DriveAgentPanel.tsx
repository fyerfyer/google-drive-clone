import { useRef, useEffect, useState, useCallback } from "react";
import {
  IconX,
  IconSparkles,
  IconFolder,
  IconFilePlus,
  IconSearch,
  IconShare,
  IconHistory,
  IconArrowLeft,
  IconPlus,
  IconActivity,
} from "@tabler/icons-react";
import { useAgentStore } from "@/stores/useAgentStore";
import {
  useAgentChat,
  useAgentConversations,
  useLoadConversation,
  useDeleteConversation,
  useAgentStatus,
} from "@/hooks/agent/useAgent";
import { AgentMessage } from "./AgentMessage";
import { AgentInput } from "./AgentInput";
import { AgentConversationList } from "./AgentConversationList";
import { TaskPlanDisplay } from "./TaskPlanDisplay";
import { ApprovalList } from "./ApprovalCard";
import { StreamingResponse } from "./StreamingResponse";
import { AgentDashboard } from "./AgentDashboard";
import { cn } from "@/lib/utils";

interface DriveAgentPanelProps {
  folderId: string;
  folderName: string;
  isOpen: boolean;
  onClose: () => void;
  /** Callback fired when the agent modifies drive content (create/delete/move files/folders) */
  onDriveUpdate?: () => void;
}

const QUICK_ACTIONS = [
  {
    icon: IconSearch,
    label: "List Files",
    prompt: "List all files and folders in the current directory",
  },
  {
    icon: IconFilePlus,
    label: "Create File",
    prompt: "Create a new file in this folder",
  },
  {
    icon: IconShare,
    label: "Share",
    prompt: "Create a share link for this folder",
  },
  {
    icon: IconFolder,
    label: "Organize",
    prompt: "Help me organize the files in this folder",
  },
];

const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 320;

export function DriveAgentPanel({
  folderId,
  folderName,
  isOpen,
  onClose,
  onDriveUpdate,
}: DriveAgentPanelProps) {
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
  const [showDashboard, setShowDashboard] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, width: 0 });

  // Set the drive context when opening
  useEffect(() => {
    if (isOpen && folderId) {
      setContext({
        type: "drive",
        folderId,
        fileName: folderName,
      });
    }
  }, [isOpen, folderId, folderName, setContext]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, streamingToolCalls, isStreaming]);

  // Watch for drive-modifying tool calls to trigger refresh
  useEffect(() => {
    if (!onDriveUpdate || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "assistant" && lastMsg.toolCalls) {
      const modifyingTools = [
        "create_file",
        "delete_file",
        "move_file",
        "rename_file",
        "create_folder",
        "delete_folder",
        "move_folder",
        "rename_folder",
        "trash_file",
        "trash_folder",
        "restore_file",
        "restore_folder",
        "star_file",
        "star_folder",
        "unstar_file",
        "unstar_folder",
        "write_file",
        "patch_file",
        "upload_file",
      ];
      const hasModification = lastMsg.toolCalls.some(
        (tc) => modifyingTools.includes(tc.toolName) && !tc.isError,
      );
      if (hasModification) {
        // Small delay to ensure backend storage has committed
        setTimeout(() => onDriveUpdate(), 500);
      }
    }
  }, [messages, onDriveUpdate]);

  // ── Resize handlers ──
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      resizeStartRef.current = { x: e.clientX, width: panelWidth };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isResizingRef.current) return;
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
        ) : showDashboard ? (
          <>
            <button
              onClick={() => setShowDashboard(false)}
              className="rounded-md p-1 hover:bg-muted transition-colors"
            >
              <IconArrowLeft className="size-3.5" />
            </button>
            <span className="text-xs font-semibold">Dashboard</span>
          </>
        ) : (
          <>
            <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <IconFolder className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold">Drive AI</h3>
              <p className="text-[10px] text-muted-foreground truncate">
                {folderName || "My Drive"}
              </p>
            </div>
          </>
        )}
        <div className="flex items-center gap-0.5 ml-auto">
          {!showHistory && !showDashboard && (
            <>
              <button
                onClick={() => newConversation()}
                className="rounded-md p-1 hover:bg-muted transition-colors"
                title="New conversation"
              >
                <IconPlus className="size-3.5" />
              </button>
              <button
                onClick={() => setShowDashboard(true)}
                className="rounded-md p-1 hover:bg-muted transition-colors"
                title="Dashboard"
              >
                <IconActivity className="size-3.5" />
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
        {showDashboard ? (
          <AgentDashboard />
        ) : showHistory ? (
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
                <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-blue-500/20 to-blue-500/5 text-blue-500 mb-3">
                  <IconSparkles className="size-6" />
                </div>
                <h4 className="text-xs font-semibold mb-1">Drive Assistant</h4>
                <p className="text-[11px] text-muted-foreground max-w-[220px] mb-5">
                  Manage files, organize folders, search, and share — all with
                  AI in{" "}
                  <span className="font-medium">
                    {folderName || "My Drive"}
                  </span>
                  .
                </p>

                <div className="grid grid-cols-2 gap-2 w-full">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => sendMessage(action.prompt, "drive")}
                      disabled={!isConfigured || isLoading}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center",
                        "hover:bg-blue-500/5 hover:border-blue-500/20 transition-all",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      <action.icon className="size-4 text-blue-500" />
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

            {/* Streaming response */}
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
      {!showHistory && !showDashboard && (
        <AgentInput
          onSend={(msg) => sendMessage(msg, "drive")}
          isLoading={isLoading}
          disabled={!isConfigured}
        />
      )}
    </div>
  );
}
