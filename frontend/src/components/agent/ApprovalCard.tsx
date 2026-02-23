import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PendingApproval } from "@/types/agent.types";
import { useResolveApproval } from "@/hooks/agent/useAgent";
import {
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconLoader2,
  IconShieldCheck,
  IconShare,
  IconEye,
  IconEdit,
  IconLock,
  IconCalendar,
} from "@tabler/icons-react";

const TOOL_LABELS: Record<string, string> = {
  write_file: "Write File Content",
  patch_file: "Patch File Content",
  trash_file: "Trash File",
  trash_folder: "Trash Folder",
  delete_file: "Permanently Delete File",
  delete_folder: "Permanently Delete Folder",
  revoke_share_link: "Revoke Share Link",
  share_with_users: "Share with Users",
  create_share_link: "Create Share Link",
};

/** Tools that show the share configuration form */
const SHARE_TOOLS = new Set(["share_with_users", "create_share_link"]);

function isShareTool(toolName: string): boolean {
  return SHARE_TOOLS.has(toolName);
}

// ─── Share Config Form ──────────────────────────────────────────

interface ShareConfigFormProps {
  toolName: string;
  args: Record<string, unknown>;
  onChange: (modifiedArgs: Record<string, unknown>) => void;
}

function ShareConfigForm({ toolName, args, onChange }: ShareConfigFormProps) {
  const initialRole = (args.role as string) || "viewer";
  const initialEmails = Array.isArray(args.emails)
    ? (args.emails as string[]).join(", ")
    : "";
  const initialPassword = (args.password as string) || "";
  const initialExpiry = (args.expiresAt as string) || "";

  const [role, setRole] = useState(initialRole);
  const [emails, setEmails] = useState(initialEmails);
  const [password, setPassword] = useState(initialPassword);
  const [expiresAt, setExpiresAt] = useState(initialExpiry);

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    emitChange({ role: newRole, emails, password, expiresAt });
  };

  const handleEmailsChange = (value: string) => {
    setEmails(value);
    emitChange({ role, emails: value, password, expiresAt });
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    emitChange({ role, emails, password: value, expiresAt });
  };

  const handleExpiryChange = (value: string) => {
    setExpiresAt(value);
    emitChange({ role, emails, password, expiresAt: value });
  };

  const emitChange = (values: {
    role: string;
    emails: string;
    password: string;
    expiresAt: string;
  }) => {
    const modified: Record<string, unknown> = { role: values.role };

    if (toolName === "share_with_users") {
      // Parse comma-separated emails
      const emailList = values.emails
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      if (emailList.length > 0) modified.emails = emailList;
    }

    if (toolName === "create_share_link") {
      if (values.password) modified.password = values.password;
      if (values.expiresAt) modified.expiresAt = values.expiresAt;
    }

    onChange(modified);
  };

  return (
    <div className="space-y-2.5 rounded-lg border border-primary/10 bg-primary/2 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/60">
        <IconShare className="size-3" />
        Share Settings
      </div>

      {/* Role selector */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Permission
        </label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => handleRoleChange("viewer")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors",
              role === "viewer"
                ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            <IconEye className="size-3" />
            Viewer
          </button>
          <button
            type="button"
            onClick={() => handleRoleChange("editor")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors",
              role === "editor"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            <IconEdit className="size-3" />
            Editor
          </button>
        </div>
      </div>

      {/* Emails (only for share_with_users) */}
      {toolName === "share_with_users" && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Share with (emails)
          </label>
          <input
            type="text"
            value={emails}
            onChange={(e) => handleEmailsChange(e.target.value)}
            placeholder="email1@example.com, email2@example.com"
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      )}

      {/* Password & Expiry (for create_share_link) */}
      {toolName === "create_share_link" && (
        <>
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <IconLock className="size-3" />
              Password (optional)
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder="Leave empty for no password"
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <IconCalendar className="size-3" />
              Expiration (optional)
            </label>
            <input
              type="datetime-local"
              value={expiresAt ? expiresAt.slice(0, 16) : ""}
              onChange={(e) =>
                handleExpiryChange(
                  e.target.value ? new Date(e.target.value).toISOString() : "",
                )
              }
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Approval Card ──────────────────────────────────────────────

interface ApprovalCardProps {
  approval: PendingApproval;
  compact?: boolean;
}

export function ApprovalCard({ approval, compact }: ApprovalCardProps) {
  const resolveApproval = useResolveApproval();
  const isResolving = resolveApproval.isPending;
  const label = TOOL_LABELS[approval.toolName] || approval.toolName;
  const showShareConfig = isShareTool(approval.toolName);

  // Track modified args from the share config form
  const [modifiedArgs, setModifiedArgs] = useState<Record<
    string,
    unknown
  > | null>(null);

  const handleApprove = () => {
    resolveApproval.mutate({
      approvalId: approval.approvalId,
      approved: true,
      modifiedArgs: modifiedArgs || undefined,
    });
  };

  const handleReject = () => {
    resolveApproval.mutate({
      approvalId: approval.approvalId,
      approved: false,
    });
  };

  // Build display reason with share config info
  const displayReason = useMemo(() => {
    if (!showShareConfig || !modifiedArgs) return approval.reason;
    const parts = [approval.reason];
    if (modifiedArgs.role && modifiedArgs.role !== approval.args.role) {
      parts.push(`(role changed to ${modifiedArgs.role})`);
    }
    return parts.join(" ");
  }, [approval.reason, approval.args.role, showShareConfig, modifiedArgs]);

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
        <IconAlertTriangle className="size-3.5 shrink-0 text-amber-500" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium">{label}</span>
          <p className="text-[10px] text-muted-foreground truncate">
            {displayReason}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={handleReject}
            disabled={isResolving}
            className="flex size-6 items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <IconX className="size-3" />
          </button>
          <button
            onClick={handleApprove}
            disabled={isResolving}
            className="flex size-6 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {isResolving ? (
              <IconLoader2 className="size-3 animate-spin" />
            ) : (
              <IconCheck className="size-3" />
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-linear-to-br from-amber-500/5 to-transparent shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-amber-500/10 bg-amber-500/5 px-4 py-2.5">
        {showShareConfig ? (
          <IconShare className="size-4 text-amber-500" />
        ) : (
          <IconShieldCheck className="size-4 text-amber-500" />
        )}
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          {showShareConfig
            ? "Sharing — Configure & Approve"
            : "Approval Required"}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-mono font-medium text-amber-600 dark:text-amber-400">
              {approval.toolName}
            </span>
          </div>
          <h4 className="text-sm font-semibold">{label}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {approval.reason}
          </p>
        </div>

        {/* Share Config Form — interactive settings for share tools */}
        {showShareConfig && (
          <ShareConfigForm
            toolName={approval.toolName}
            args={approval.args}
            onChange={setModifiedArgs}
          />
        )}

        {/* Arguments preview (non-share tools only) */}
        {!showShareConfig &&
          approval.args &&
          Object.keys(approval.args).length > 0 && (
            <div className="rounded-lg bg-muted/50 p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Parameters
              </span>
              <pre className="mt-1 text-[11px] leading-relaxed overflow-x-auto">
                {JSON.stringify(
                  Object.fromEntries(
                    Object.entries(approval.args).filter(
                      ([k]) => k !== "userId",
                    ),
                  ),
                  null,
                  2,
                )}
              </pre>
            </div>
          )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleReject}
            disabled={isResolving}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              "border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/10",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <IconX className="size-3.5" />
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={isResolving}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {isResolving ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : (
              <IconCheck className="size-3.5" />
            )}
            {showShareConfig ? "Share" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ApprovalListProps {
  approvals: PendingApproval[];
  compact?: boolean;
}

export function ApprovalList({ approvals, compact }: ApprovalListProps) {
  if (approvals.length === 0) return null;

  return (
    <div className="space-y-2">
      {approvals.map((a) => (
        <ApprovalCard key={a.approvalId} approval={a} compact={compact} />
      ))}
    </div>
  );
}
