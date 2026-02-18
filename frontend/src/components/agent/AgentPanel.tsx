import { useRef, useEffect, useState } from "react";
import {
  IconRobot,
  IconX,
  IconPlus,
  IconHistory,
  IconArrowLeft,
  IconSparkles,
  IconAlertTriangle,
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

export function AgentPanel() {
  const { isOpen, close } = useAgentStore();
  const { messages, isLoading, conversationId, sendMessage, newConversation } =
    useAgentChat();
  const { data: conversations, isLoading: conversationsLoading } =
    useAgentConversations();
  const { loadConversation } = useLoadConversation();
  const deleteConversation = useDeleteConversation();
  const { data: agentStatus } = useAgentStatus();

  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        ) : (
          <>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconRobot className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">AI Assistant</h3>
              <p className="text-[11px] text-muted-foreground truncate">
                {isConfigured
                  ? `${agentStatus?.model} via MCP`
                  : "Not configured"}
              </p>
            </div>
          </>
        )}

        <div className="flex items-center gap-1 ml-auto">
          {!showHistory && (
            <>
              <button
                onClick={() => {
                  newConversation();
                }}
                className="rounded-md p-1.5 hover:bg-muted transition-colors"
                title="New conversation"
              >
                <IconPlus className="size-4" />
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
        {showHistory ? (
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
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                  <IconSparkles className="size-6" />
                </div>
                <h4 className="text-sm font-semibold mb-1">
                  How can I help you?
                </h4>
                <p className="text-xs text-muted-foreground max-w-xs mb-6">
                  I can help you manage files, folders, search your drive, and
                  handle sharing — all through natural language.
                </p>

                {/* Suggested prompts */}
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      disabled={!isConfigured || isLoading}
                      className="rounded-lg border px-3 py-2 text-left text-xs hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <AgentMessage key={`${msg.role}-${i}`} message={msg} />
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 py-3 px-1">
                <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <IconRobot className="size-4" />
                </div>
                <div className="flex gap-1">
                  <span
                    className="size-2 rounded-full bg-muted-foreground/40 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="size-2 rounded-full bg-muted-foreground/40 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="size-2 rounded-full bg-muted-foreground/40 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {!showHistory && (
        <AgentInput
          onSend={sendMessage}
          isLoading={isLoading}
          disabled={!isConfigured}
        />
      )}
    </div>
  );
}

const SUGGESTIONS = [
  "Show me my recent files",
  "List all files in my drive",
  "Search for PDF documents",
  "Index all my files for semantic search",
  "Show my indexing status",
];
