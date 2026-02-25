import { useState } from "react";
import {
  IconListCheck,
  IconCircleCheck,
  IconCircleX,
  IconLoader2,
  IconChevronDown,
  IconChevronRight,
  IconPlayerSkipForward,
  IconCircleDashed,
} from "@tabler/icons-react";
import type { TaskPlan, TaskStep, TaskStatus } from "@/types/agent.types";
import { cn } from "@/lib/utils";
import { TASK_STATUS } from "@/types/agent.types";

// ─── Status Icons ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TaskStatus,
  {
    icon: typeof IconCircleCheck;
    color: string;
    label: string;
  }
> = {
  [TASK_STATUS.PENDING]: {
    icon: IconCircleDashed,
    color: "text-muted-foreground",
    label: "Pending",
  },
  [TASK_STATUS.IN_PROGRESS]: {
    icon: IconLoader2,
    color: "text-blue-500",
    label: "In Progress",
  },
  [TASK_STATUS.COMPLETED]: {
    icon: IconCircleCheck,
    color: "text-emerald-500",
    label: "Completed",
  },
  [TASK_STATUS.FAILED]: {
    icon: IconCircleX,
    color: "text-destructive",
    label: "Failed",
  },
  [TASK_STATUS.SKIPPED]: {
    icon: IconPlayerSkipForward,
    color: "text-muted-foreground",
    label: "Skipped",
  },
};

// ─── Task Step Item ────────────────────────────────────────────────

function TaskStepItem({ step }: { step: TaskStep }) {
  const [expanded, setExpanded] = useState(false);
  const config =
    STATUS_CONFIG[step.status] || STATUS_CONFIG[TASK_STATUS.PENDING];
  const Icon = config.icon;
  const isAnimated = step.status === TASK_STATUS.IN_PROGRESS;

  const hasDetails = step.description || step.result || step.error;

  return (
    <div className="group">
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
          hasDetails && "hover:bg-muted/60 cursor-pointer",
          !hasDetails && "cursor-default",
        )}
      >
        {/* Expand/collapse indicator */}
        {hasDetails ? (
          expanded ? (
            <IconChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <IconChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="size-3 shrink-0" />
        )}

        {/* Status icon */}
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            config.color,
            isAnimated && "animate-spin",
          )}
        />

        {/* Step title */}
        <span
          className={cn(
            "flex-1 font-medium truncate",
            step.status === TASK_STATUS.COMPLETED && "text-muted-foreground",
            step.status === TASK_STATUS.FAILED && "text-destructive",
            step.status === TASK_STATUS.SKIPPED &&
              "text-muted-foreground line-through",
          )}
        >
          {step.title || `Step ${step.id}`}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="ml-[34px] mt-0.5 mb-1 space-y-1">
          {step.description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {step.description}
            </p>
          )}
          {step.result && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 leading-relaxed">
              {step.result}
            </p>
          )}
          {step.error && (
            <p className="text-[11px] text-destructive leading-relaxed">
              {step.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Task Plan Display ─────────────────────────────────────────────

interface TaskPlanDisplayProps {
  plan: TaskPlan;
}

export function TaskPlanDisplay({ plan }: TaskPlanDisplayProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!plan || !plan.steps || plan.steps.length === 0) return null;

  const completed = plan.steps.filter(
    (s) => s.status === TASK_STATUS.COMPLETED,
  ).length;
  const failed = plan.steps.filter(
    (s) => s.status === TASK_STATUS.FAILED,
  ).length;
  const total = plan.steps.length;
  const progressPct = Math.round((completed / total) * 100);

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        <IconListCheck className="size-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold truncate block">
            {plan.goal}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
          {completed}/{total}
          {failed > 0 && (
            <span className="text-destructive ml-1">({failed} failed)</span>
          )}
        </span>
        {collapsed ? (
          <IconChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <IconChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Progress bar */}
      <div className="h-0.5 bg-muted">
        <div
          className={cn(
            "h-full transition-all duration-500",
            failed > 0 && completed + failed === total
              ? "bg-destructive"
              : "bg-emerald-500",
          )}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Steps list */}
      {!collapsed && (
        <div className="px-1 py-1">
          {plan.steps.map((step, idx) => (
            <TaskStepItem key={step.id ?? idx} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}
