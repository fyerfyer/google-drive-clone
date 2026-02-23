import { IconRobot } from "@tabler/icons-react";
import { useAgentStore } from "@/stores/useAgentStore";
import { useLocation } from "react-router-dom";

export function AgentTrigger() {
  const { toggle, isOpen } = useAgentStore();
  const location = useLocation();

  // Hide on editor pages (they have their own DocumentAgentPanel)
  // Hide on files pages (they have their own DriveAgentPanel)
  if (location.pathname.startsWith("/editor")) return null;
  if (location.pathname.startsWith("/files")) return null;
  if (isOpen) return null;

  return (
    <button
      onClick={toggle}
      className="fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all"
      title="Open AI Assistant"
    >
      <IconRobot className="size-6" />
    </button>
  );
}
