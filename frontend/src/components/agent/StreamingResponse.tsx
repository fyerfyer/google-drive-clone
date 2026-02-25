/**
 * StreamingResponse — renders the in-progress assistant response inline
 * below the user's message. Shows task plan, tool calls, streaming content,
 * approvals, and the thinking indicator as a unified block.
 */

import {
  IconRobot,
  IconCircleCheck,
  IconCircleX,
  IconLoader2,
  IconCircleDashed,
  IconPlayerSkipForward,
  IconChevronDown,
  IconChevronRight,
  IconListCheck,
} from "@tabler/icons-react";
import { useAgentStore } from "@/stores/useAgentStore";
import { AgentToolCall } from "./AgentToolCall";
import { ApprovalList } from "./ApprovalCard";
import { StreamingContent } from "./StreamingContent";
import type { TaskPlan, TaskStep, TaskStatus } from "@/types/agent.types";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { TASK_STATUS } from "@/types/agent.types";

// ─── Task Step Status Icons ──────────────────────────────────────

const STEP_STATUS: Record<
  TaskStatus,
  { icon: typeof IconCircleCheck; color: string }
> = {
  [TASK_STATUS.PENDING]: {
    icon: IconCircleDashed,
    color: "text-muted-foreground",
  },
  [TASK_STATUS.IN_PROGRESS]: { icon: IconLoader2, color: "text-blue-500" },
  [TASK_STATUS.COMPLETED]: { icon: IconCircleCheck, color: "text-emerald-500" },
  [TASK_STATUS.FAILED]: { icon: IconCircleX, color: "text-destructive" },
  [TASK_STATUS.SKIPPED]: {
    icon: IconPlayerSkipForward,
    color: "text-muted-foreground",
  },
};

function InlineTaskStep({
  step,
  isCurrent,
}: {
  step: TaskStep;
  isCurrent: boolean;
}) {
  const config = STEP_STATUS[step.status] || STEP_STATUS[TASK_STATUS.PENDING];
  const Icon = config.icon;
  const isSpinning = step.status === TASK_STATUS.IN_PROGRESS;

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1 px-2 rounded-md text-xs transition-colors",
        isCurrent && step.status === TASK_STATUS.IN_PROGRESS && "bg-blue-500/5",
      )}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          config.color,
          isSpinning && "animate-spin",
        )}
      />
      <span
        className={cn(
          "flex-1 truncate",
          step.status === TASK_STATUS.COMPLETED && "text-muted-foreground",
          step.status === TASK_STATUS.FAILED && "text-destructive",
          step.status === TASK_STATUS.SKIPPED &&
            "text-muted-foreground line-through",
          step.status === TASK_STATUS.IN_PROGRESS && "font-medium",
        )}
      >
        {step.title}
      </span>
      {step.error && (
        <span className="text-[10px] text-destructive truncate max-w-[120px]">
          {step.error}
        </span>
      )}
    </div>
  );
}

function InlineTaskPlan({ plan }: { plan: TaskPlan }) {
  const [collapsed, setCollapsed] = useState(false);
  const completed = plan.steps.filter(
    (s) => s.status === TASK_STATUS.COMPLETED,
  ).length;
  const total = plan.steps.length;
  const progressPct = Math.round((completed / total) * 100);
  const failed = plan.steps.filter(
    (s) => s.status === TASK_STATUS.FAILED,
  ).length;

  return (
    <div className="rounded-lg border bg-card/50 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        <IconListCheck className="size-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold flex-1 truncate">
          {plan.goal}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {completed}/{total}
          {failed > 0 && (
            <span className="text-destructive ml-1">({failed} failed)</span>
          )}
        </span>
        {collapsed ? (
          <IconChevronRight className="size-3 text-muted-foreground" />
        ) : (
          <IconChevronDown className="size-3 text-muted-foreground" />
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

      {!collapsed && (
        <div className="px-1 py-1">
          {plan.steps.map((step, idx) => (
            <InlineTaskStep
              key={step.id ?? idx}
              step={step}
              isCurrent={step.status === "in-progress"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step Header (group label for tool calls under a step) ───────

function StepHeader({ step }: { step: TaskStep }) {
  const config = STEP_STATUS[step.status] || STEP_STATUS["in-progress"];
  const Icon = config.icon;
  const isSpinning = step.status === "in-progress";

  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <Icon
        className={cn(
          "size-3 shrink-0",
          config.color,
          isSpinning && "animate-spin",
        )}
      />
      <span className="font-medium text-muted-foreground">
        Step {step.id}: {step.title}
      </span>
    </div>
  );
}

// ─── Main StreamingResponse Component ────────────────────────────

export function StreamingResponse() {
  const {
    isLoading,
    isStreaming,
    taskPlan,
    streamingContent,
    streamingToolCalls,
    streamingStepId,
    streamingError,
    pendingApprovals,
  } = useAgentStore();

  // Only show when loading/streaming
  if (!isLoading && !isStreaming) return null;

  // Find the current step if we have a plan
  const currentStep =
    taskPlan && streamingStepId
      ? taskPlan.steps.find((s) => s.id === streamingStepId)
      : null;

  const hasAnyContent =
    streamingContent ||
    streamingToolCalls.length > 0 ||
    taskPlan ||
    pendingApprovals.length > 0 ||
    streamingError;

  return (
    <div className="flex gap-3 py-3">
      {/* Assistant avatar */}
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
        <IconRobot className="size-4" />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Task Plan - inline collapsible */}
        {taskPlan && taskPlan.steps.length > 0 && (
          <InlineTaskPlan plan={taskPlan} />
        )}

        {/* Current step header */}
        {currentStep && taskPlan && taskPlan.steps.length > 1 && (
          <StepHeader step={currentStep} />
        )}

        {/* Streaming tool calls */}
        {streamingToolCalls.length > 0 && (
          <div className="space-y-1">
            {streamingToolCalls.map((tc, i) => (
              <AgentToolCall
                key={`stream-tc-${tc.toolName}-${i}`}
                toolCall={tc}
              />
            ))}
          </div>
        )}

        {/* Streaming content text */}
        {streamingContent && (
          <StreamingContent content={streamingContent} inline />
        )}

        {/* Pending Approvals */}
        {pendingApprovals.length > 0 && (
          <ApprovalList approvals={pendingApprovals} />
        )}

        {/* Error display */}
        {streamingError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <span className="font-medium">Error: </span>
            {streamingError}
          </div>
        )}

        {/* Thinking indicator */}
        {!hasAnyContent && (
          <div className="flex items-center gap-2 py-1">
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
            <span className="text-xs text-muted-foreground">Thinking...</span>
          </div>
        )}

        {/* Show thinking dots while still processing but already have some content */}
        {hasAnyContent &&
          isStreaming &&
          !streamingContent &&
          !streamingError &&
          pendingApprovals.length === 0 && (
            <div className="flex items-center gap-1 py-1">
              <div className="flex gap-1">
                <span
                  className="size-1.5 rounded-full bg-muted-foreground/30 animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="size-1.5 rounded-full bg-muted-foreground/30 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="size-1.5 rounded-full bg-muted-foreground/30 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
