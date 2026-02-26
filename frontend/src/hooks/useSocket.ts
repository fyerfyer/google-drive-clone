import { useEffect, useRef } from "react";
import { Socket } from "socket.io-client";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { useAgentStore } from "@/stores/useAgentStore";
import { useBackgroundTasksStore } from "@/stores/useBackgroundTasksStore";
import type { PendingApproval } from "@/types/agent.types";
import { toast } from "sonner";

// Global socket connection hook.
export function useSocketConnection() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    socket.on(
      "agent:approval_needed",
      (data: { approvals: PendingApproval[]; timestamp: string }) => {
        const mainStore = useAgentStore.getState();
        const bgStore = useBackgroundTasksStore.getState();

        for (const approval of data.approvals) {
          // Check if SSE handler already tracked this approval
          const inMain = mainStore.pendingApprovals.some(
            (a) => a.approvalId === approval.approvalId,
          );
          const inBg = Object.values(bgStore.tasks).some((t) =>
            t.pendingApprovals.some(
              (a) => a.approvalId === approval.approvalId,
            ),
          );

          if (!inMain && !inBg) {
            // Fallback: SSE hasn't picked it up yet — add to main store
            mainStore.addPendingApproval(approval);
          }

          toast.warning(`Approval needed: ${approval.toolName}`, {
            description: approval.reason,
            duration: 10_000,
          });
        }
      },
    );

    socket.on(
      "agent:approval_resolved",
      (data: {
        approvalId: string;
        toolName: string;
        success: boolean;
        timestamp: string;
      }) => {
        // Resolve in main store
        const mainStore = useAgentStore.getState();
        if (
          mainStore.pendingApprovals.some(
            (a) => a.approvalId === data.approvalId,
          )
        ) {
          mainStore.removePendingApproval(data.approvalId);
        }

        // Also resolve in any background task
        const bgStore = useBackgroundTasksStore.getState();
        for (const [taskId, task] of Object.entries(bgStore.tasks)) {
          if (
            task.pendingApprovals.some((a) => a.approvalId === data.approvalId)
          ) {
            const remaining = task.pendingApprovals.filter(
              (a) => a.approvalId !== data.approvalId,
            );
            bgStore.updateTask(taskId, {
              pendingApprovals: remaining,
              status: remaining.length > 0 ? "waiting_approval" : "running",
            });
          }
        }

        if (data.success) {
          toast.success(`Operation "${data.toolName}" completed`);
        } else {
          toast.error(`Operation "${data.toolName}" failed`);
        }
      },
    );

    return () => {
      socket.off("agent:approval_needed");
      socket.off("agent:approval_resolved");
      disconnectSocket();
    };
  }, []);

  return socketRef;
}

// Hook to join/leave a document room for real-time editing awareness.
export function useDocumentSocket(fileId: string | null) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!fileId) return;

    const socket = connectSocket();
    socketRef.current = socket;

    socket.emit("document:join", { fileId });

    socket.on(
      "document:user_joined",
      (data: { userId: string; userName: string }) => {
        toast.info(`${data.userName} joined the document`);
      },
    );

    socket.on(
      "document:user_left",
      (data: { userId: string; userName: string }) => {
        toast.info(`${data.userName} left the document`);
      },
    );

    return () => {
      socket.emit("document:leave", { fileId });
      socket.off("document:user_joined");
      socket.off("document:user_left");
    };
  }, [fileId]);

  return socketRef;
}
