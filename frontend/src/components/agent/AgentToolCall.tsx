import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  IconChevronDown,
  IconChevronRight,
  IconTool,
  IconCheck,
  IconX,
  IconLoader2,
} from "@tabler/icons-react";
import type { ToolCall } from "@/types/agent.types";

interface AgentToolCallProps {
  toolCall: ToolCall;
}

const TOOL_LABELS: Record<string, string> = {
  list_files: "List Files",
  get_file_info: "Get File Info",
  read_file: "Read File",
  write_file: "Write File",
  create_file: "Create File",
  rename_file: "Rename File",
  move_file: "Move File",
  trash_file: "Trash File",
  restore_file: "Restore File",
  delete_file: "Delete File",
  star_file: "Star File",
  get_download_url: "Get Download URL",
  list_folder_contents: "List Folder",
  create_folder: "Create Folder",
  rename_folder: "Rename Folder",
  move_folder: "Move Folder",
  trash_folder: "Trash Folder",
  restore_folder: "Restore Folder",
  delete_folder: "Delete Folder",
  get_folder_path: "Get Folder Path",
  star_folder: "Star Folder",
  patch_file: "Patch File",
  search_files: "Search Files",
  summarize_directory: "Summarize Directory",
  query_workspace_knowledge: "Query Knowledge",
  create_share_link: "Create Share Link",
  list_share_links: "List Share Links",
  revoke_share_link: "Revoke Share Link",
  share_with_users: "Share with Users",
  get_permissions: "Get Permissions",
  list_shared_with_me: "Shared with Me",
  // Knowledge Layer
  index_file: "Index File",
  index_all_files: "Index All Files",
  semantic_search_files: "Semantic Search",
  get_indexing_status: "Indexing Status",
  // Auth
  authenticate: "Authenticate",
  whoami: "Who Am I",
};

export function AgentToolCall({ toolCall }: AgentToolCallProps) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolCall.toolName] || toolCall.toolName;
  const isPending = toolCall.result === undefined || toolCall.result === null;

  return (
    <div
      className={cn(
        "my-1.5 rounded-md border bg-muted/40 text-xs",
        isPending && "border-blue-500/30",
        toolCall.isError && "border-destructive/30",
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/60 transition-colors"
      >
        {expanded ? (
          <IconChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <IconTool className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium">{label}</span>
        {isPending ? (
          <IconLoader2 className="ml-auto size-3.5 text-blue-500 animate-spin" />
        ) : toolCall.isError ? (
          <IconX className="ml-auto size-3.5 text-destructive" />
        ) : (
          <IconCheck className="ml-auto size-3.5 text-emerald-500" />
        )}
      </button>

      {expanded && (
        <div className="border-t px-3 py-2 space-y-2">
          {/* Arguments */}
          <div>
            <span className="font-semibold text-muted-foreground">
              Arguments:
            </span>
            <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-[11px] leading-relaxed">
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(toolCall.args).filter(([k]) => k !== "userId"),
                ),
                null,
                2,
              )}
            </pre>
          </div>

          {/* Pending state */}
          {isPending && (
            <div className="text-[11px] text-blue-500 italic">Executing...</div>
          )}

          {/* Result */}
          {toolCall.result && (
            <div>
              <span
                className={cn(
                  "font-semibold",
                  toolCall.isError
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {toolCall.isError ? "Error:" : "Result:"}
              </span>
              <pre
                className={cn(
                  "mt-1 overflow-x-auto rounded p-2 text-[11px] leading-relaxed max-h-48 overflow-y-auto",
                  toolCall.isError ? "bg-destructive/10" : "bg-background",
                )}
              >
                {formatResult(toolCall.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatResult(result: string): string {
  try {
    const parsed = JSON.parse(result);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return result;
  }
}
