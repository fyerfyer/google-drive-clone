import { useMemo } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAgentStore } from "@/stores/useAgentStore";
import { useBackgroundTasksStore } from "@/stores/useBackgroundTasksStore";
import { ApprovalList } from "./ApprovalCard";
import type { PendingApproval } from "@/types/agent.types";

interface ApprovalGroup {
  key: string;
  label: string;
  approvals: PendingApproval[];
}

export function AgentApprovalModal() {
  const pendingApprovals = useAgentStore((s) => s.pendingApprovals);
  const isOpen = useAgentStore((s) => s.isOpen);
  const isDrivePanelOpen = useAgentStore((s) => s.isDrivePanelOpen);
  const isDocumentPanelOpen = useAgentStore((s) => s.isDocumentPanelOpen);

  const tasks = useBackgroundTasksStore((s) => s.tasks);
  const backgroundTasks = useMemo(
    () => Object.values(tasks).filter((t) => t.pendingApprovals.length > 0),
    [tasks],
  );

  const isAgentUiVisible = isOpen || isDrivePanelOpen || isDocumentPanelOpen;

  const groups = useMemo<ApprovalGroup[]>(() => {
    const next: ApprovalGroup[] = [];
    const seen = new Set<string>();

    if (!isAgentUiVisible && pendingApprovals.length > 0) {
      const unique = pendingApprovals.filter((a) => {
        if (seen.has(a.approvalId)) return false;
        seen.add(a.approvalId);
        return true;
      });
      if (unique.length > 0) {
        next.push({
          key: "current",
          label: "Current task",
          approvals: unique,
        });
      }
    }

    backgroundTasks.forEach((task) => {
      const unique = task.pendingApprovals.filter((a) => {
        if (seen.has(a.approvalId)) return false;
        seen.add(a.approvalId);
        return true;
      });
      if (unique.length === 0) return;

      next.push({
        key: task.taskId,
        label: task.userMessage
          ? `Background task: ${task.userMessage}`
          : "Background task",
        approvals: unique,
      });
    });

    return next;
  }, [backgroundTasks, isAgentUiVisible, pendingApprovals]);

  const approvalCount = groups.reduce(
    (sum, group) => sum + group.approvals.length,
    0,
  );

  if (approvalCount === 0) return null;

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-[720px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconAlertTriangle className="size-4 text-amber-500" />
            Approval Required
          </DialogTitle>
          <DialogDescription>
            You have pending approvals while not in the active conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key} className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground line-clamp-2">
                {group.label}
              </div>
              <ApprovalList approvals={group.approvals} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
