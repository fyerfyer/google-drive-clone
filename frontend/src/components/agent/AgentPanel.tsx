import { useRef, useEffect, useState } from "react";
import {
  IconRobot,
  IconX,
  IconPlus,
  IconHistory,
  IconArrowLeft,
  IconSparkles,
  IconAlertTriangle,
  IconFolder,
  IconFileText,
  IconSearch,
  IconActivity,
} from "@tabler/icons-react";
import { useAgentStore } from "@/stores/useAgentStore";
import { useBackgroundTasksStore } from "@/stores/useBackgroundTasksStore";
import {
  useAgentChat,
  useAgentConversations,
  useLoadConversation,
  useDeleteConversation,
  useAgentStatus,
} from "@/hooks/agent/useAgent";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { AgentMessage } from "./AgentMessage";
import { AgentInput } from "./AgentInput";
import { AgentConversationList } from "./AgentConversationList";
import { AgentTypeBadge } from "./AgentTypeBadge";
import { TaskPlanDisplay } from "./TaskPlanDisplay";
import { ApprovalList } from "./ApprovalCard";
import { StreamingResponse } from "./StreamingResponse";
import { AgentDashboard } from "./AgentDashboard";
import type { AgentType } from "@/types/agent.types";
import { AGENT_REGISTRY } from "@/types/agent.types";
import { cn } from "@/lib/utils";

const AGENT_ICON_MAP: Record<AgentType, typeof IconFolder> = {
  drive: IconFolder,
  document: IconFileText,
  search: IconSearch,
};

export function AgentPanel() {
  const {
    isOpen,
    close,
    open,
    agentType,
    taskPlan,
    pendingApprovals,
    isLoading,
    isStreaming,
  } = useAgentStore();
  const { messages, conversationId, sendMessage, newConversation } =
    useAgentChat();
  const { data: conversations, isLoading: conversationsLoading } =
    useAgentConversations();
  const { loadConversation } = useLoadConversation();
  const deleteConversation = useDeleteConversation();
  const { data: agentStatus } = useAgentStatus();
  const queryClient = useQueryClient();

  // Background tasks count for indicator
  const bgTaskCount = useBackgroundTasksStore(
    (s) =>
      Object.values(s.tasks).filter(
        (t) => t.status === "running" || t.status === "waiting_approval",
      ).length,
  );

  const [showHistory, setShowHistory] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, isStreaming]);

  const { streamingContent, streamingToolCalls } = useAgentStore();
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamingContent, streamingToolCalls]);

  // Watch for drive-modifying tool calls to refresh folder queries
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "assistant" && lastMsg.toolCalls) {
      const driveModifyingTools = [
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
        (tc) => driveModifyingTools.includes(tc.toolName) && !tc.isError,
      );
      if (hasModification) {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
        }, 500);
      }
    }
  }, [messages, queryClient]);

  // Listen for "goto conversation" events from background task toasts
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        conversationId?: string;
        taskId?: string;
      };
      if (detail.conversationId || detail.taskId) {
        open();
        setShowHistory(false);
        setShowDashboard(false);
        // Pass both ids — loadConversation will try taskId first, then convId
        loadConversation(detail.conversationId ?? null, detail.taskId);
      }
    };
    window.addEventListener("agent:goto-conversation", handler);
    return () => window.removeEventListener("agent:goto-conversation", handler);
  }, [open, loadConversation]);

  if (!isOpen) return null;

  const isConfigured = agentStatus?.enabled ?? false;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-2xl animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        {showHistory ? (
          <>
            <button
              onClick={() => setShowHistory(false)}
              className="rounded-md p-1 hover:bg-muted transition-colors"
            >
              <IconArrowLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold">Conversations</span>
          </>
        ) : showDashboard ? (
          <>
            <button
              onClick={() => setShowDashboard(false)}
              className="rounded-md p-1 hover:bg-muted transition-colors"
            >
              <IconArrowLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold">Dashboard</span>
          </>
        ) : (
          <>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconRobot className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">AI Assistant</h3>
                {conversationId && (
                  <AgentTypeBadge type={agentType} size="sm" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {isConfigured
                  ? `${agentStatus?.model} via MCP`
                  : "Not configured"}
              </p>
            </div>
          </>
        )}

        <div className="flex items-center gap-1 ml-auto">
          {!showHistory && !showDashboard && (
            <>
              <button
                onClick={() => newConversation()}
                className="rounded-md p-1.5 hover:bg-muted transition-colors"
                title="New conversation"
              >
                <IconPlus className="size-4" />
              </button>
              <button
                onClick={() => setShowDashboard(true)}
                className="relative rounded-md p-1.5 hover:bg-muted transition-colors"
                title="Dashboard"
              >
                <IconActivity className="size-4" />
                {bgTaskCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {bgTaskCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className="rounded-md p-1.5 hover:bg-muted transition-colors"
                title="History"
              >
                <IconHistory className="size-4" />
              </button>
            </>
          )}
          <button
            onClick={close}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
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
          <div className="p-3">
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
          <div className="px-4 py-2">
            {/* Not configured warning */}
            {!isConfigured && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50 p-3 text-xs">
                <IconAlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    AI Agent Not Configured
                  </p>
                  <p className="mt-0.5 text-amber-700 dark:text-amber-300">
                    Set{" "}
                    <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">
                      LLM_API_KEY
                    </code>{" "}
                    in your backend environment to enable the AI assistant.
                  </p>
                </div>
              </div>
            )}

            {/* Empty state */}
            {messages.length === 0 && !isLoading && (
              <EmptyState
                isConfigured={isConfigured}
                isLoading={isLoading}
                onSend={sendMessage}
              />
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <AgentMessage key={`${msg.role}-${i}`} message={msg} />
            ))}

            {/* Streaming response - appears inline after the last user message */}
            {(isLoading || isStreaming) && <StreamingResponse />}

            {/* Non-streaming: show persisted task plan for loaded conversations */}
            {!isLoading &&
              !isStreaming &&
              taskPlan &&
              taskPlan.steps.length > 0 && (
                <div className="mb-3">
                  <TaskPlanDisplay plan={taskPlan} />
                </div>
              )}

            {/* Non-streaming: show pending approvals */}
            {!isLoading && !isStreaming && pendingApprovals.length > 0 && (
              <div className="mb-3">
                <ApprovalList approvals={pendingApprovals} />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {!showHistory && !showDashboard && (
        <AgentInput
          onSend={sendMessage}
          isLoading={isLoading}
          disabled={!isConfigured}
        />
      )}
    </div>
  );
}

function EmptyState({
  isConfigured,
  isLoading,
  onSend,
}: {
  isConfigured: boolean;
  isLoading: boolean;
  onSend: (text: string, contextType?: AgentType) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/5 text-primary mb-4">
        <IconSparkles className="size-7" />
      </div>
      <h4 className="text-sm font-semibold mb-1">How can I help you?</h4>
      <p className="text-xs text-muted-foreground max-w-xs mb-6">
        I can manage files, edit documents, search your drive, and handle
        sharing — all through natural language.
      </p>

      {/* Agent capability cards */}
      <div className="w-full max-w-xs space-y-2 mb-6">
        {(Object.keys(AGENT_REGISTRY) as AgentType[]).map((type) => {
          const info = AGENT_REGISTRY[type];
          const Icon = AGENT_ICON_MAP[type];
          return (
            <div
              key={type}
              className="flex items-start gap-3 rounded-lg border p-3 text-left"
            >
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg shrink-0",
                  type === "drive" && "bg-blue-500/10 text-blue-500",
                  type === "document" && "bg-emerald-500/10 text-emerald-500",
                  type === "search" && "bg-violet-500/10 text-violet-500",
                )}
              >
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium">{info.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {info.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Suggested prompts */}
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Try asking
        </span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s.text}
            onClick={() => onSend(s.text, s.type)}
            disabled={!isConfigured || isLoading}
            className="group flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs hover:bg-muted transition-colors disabled:opacity-50"
          >
            <AgentTypeBadge type={s.type} size="sm" showLabel={false} />
            <span className="group-hover:text-foreground">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const SUGGESTIONS: Array<{ text: string; type: AgentType }> = [
  { text: "Show me my recent files", type: "drive" },
  { text: "Search for PDF documents", type: "search" },
  { text: "Summarize the document in my current folder", type: "document" },
  { text: "Index all my files for semantic search", type: "search" },
  { text: "Create a share link for my project folder", type: "drive" },
];
