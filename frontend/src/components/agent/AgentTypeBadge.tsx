import type { AgentType } from "@/types/agent.types";
import { AGENT_REGISTRY } from "@/types/agent.types";
import {
  IconFolder,
  IconFileText,
  IconSearch,
  IconCheck,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const AGENT_ICONS: Record<AgentType, typeof IconFolder> = {
  drive: IconFolder,
  document: IconFileText,
  search: IconSearch,
};

const AGENT_COLORS: Record<AgentType, string> = {
  drive: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  document:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  search:
    "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
};

const AGENT_DOT: Record<AgentType, string> = {
  drive: "bg-blue-500",
  document: "bg-emerald-500",
  search: "bg-violet-500",
};

interface AgentTypeBadgeProps {
  type: AgentType;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

export function AgentTypeBadge({
  type,
  size = "sm",
  showLabel = true,
  className,
}: AgentTypeBadgeProps) {
  const info = AGENT_REGISTRY[type];
  const Icon = AGENT_ICONS[type];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        AGENT_COLORS[type],
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} />
      {showLabel && info.label}
    </span>
  );
}

interface AgentSelectorProps {
  selected?: AgentType;
  onSelect: (type: AgentType) => void;
  className?: string;
}

export function AgentSelector({
  selected,
  onSelect,
  className,
}: AgentSelectorProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1">
        Select Agent
      </span>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(AGENT_REGISTRY) as AgentType[]).map((type) => {
          const info = AGENT_REGISTRY[type];
          const Icon = AGENT_ICONS[type];
          const isSelected = selected === type;

          return (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className={cn(
                "relative flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all",
                "hover:border-foreground/20 hover:bg-muted/50",
                isSelected
                  ? cn(AGENT_COLORS[type], "border-current shadow-sm")
                  : "border-border",
              )}
            >
              {isSelected && (
                <IconCheck className="absolute top-1 right-1 size-3 text-current" />
              )}
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-full",
                  isSelected ? AGENT_COLORS[type] : "bg-muted",
                )}
              >
                <Icon className="size-4" />
              </div>
              <span className="text-[11px] font-medium leading-tight">
                {info.label.replace(" Agent", "")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface RouteDecisionBadgeProps {
  confidence: number;
  source: string;
  reason: string;
  agentType: AgentType;
}

export function RouteDecisionBadge({
  confidence,
  source,
  reason,
  agentType,
}: RouteDecisionBadgeProps) {
  const confidencePercent = Math.round(confidence * 100);
  const confidenceColor =
    confidence >= 0.8
      ? "text-emerald-500"
      : confidence >= 0.5
        ? "text-amber-500"
        : "text-red-400";

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-[11px]">
      <span className={cn("size-1.5 rounded-full", AGENT_DOT[agentType])} />
      <AgentTypeBadge type={agentType} size="sm" />
      <span className="text-muted-foreground">•</span>
      <span className={cn("font-mono font-semibold", confidenceColor)}>
        {confidencePercent}%
      </span>
      <span className="text-muted-foreground truncate" title={reason}>
        via {source}
        {reason ? ` — ${reason}` : ""}
      </span>
    </div>
  );
}
