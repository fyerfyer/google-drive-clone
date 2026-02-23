import { useEffect, useRef } from "react";
import { Socket } from "socket.io-client";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { useAgentStore } from "@/stores/useAgentStore";
import type { PendingApproval } from "@/types/agent.types";
import { toast } from "sonner";

// Global socket connection hook.
export function useSocketConnection() {
  const socketRef = useRef<Socket | null>(null);
  const addPendingApproval = useAgentStore((s) => s.addPendingApproval);
  const removePendingApproval = useAgentStore((s) => s.removePendingApproval);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    // ─── Agent Approval Events ──────────────────────────────────
    socket.on(
      "agent:approval_needed",
      (data: { approvals: PendingApproval[]; timestamp: string }) => {
        for (const approval of data.approvals) {
          addPendingApproval(approval);
          toast.warning(`Approval needed: ${approval.toolName}`, {
            description: approval.reason,
            duration: 10000,
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
        removePendingApproval(data.approvalId);
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
  }, [addPendingApproval, removePendingApproval]);

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
