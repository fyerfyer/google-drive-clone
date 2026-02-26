import { useState, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  IconActivity,
  IconMessageCircle,
  IconCoin,
  IconAlertTriangle,
  IconBrain,
  IconTool,
  IconEye,
  IconAlertCircle,
  IconExternalLink,
  IconTrash,
  IconCircleCheck,
  IconCircleX,
  IconLoader2,
  IconCircleDashed,
  IconPlayerSkipForward,
  IconArrowsSplit,
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import { useAgentStore } from "@/stores/useAgentStore";
import {
  useBackgroundTasksStore,
  type BackgroundTask,
} from "@/stores/useBackgroundTasksStore";
import { agentService } from "@/services/agent.service";
import { cn } from "@/lib/utils";
import type {
  TraceEntryType,
  TraceEntry,
  UserTokenBudget,
  TokenUsage,
  TaskStep,
  TaskStatus,
} from "@/types/agent.types";
import { TASK_STATUS } from "@/types/agent.types";

/* ────────────────────────────── helpers ────────────────────────────── */

const TRACE_ICON: Record<TraceEntryType, typeof IconBrain> = {
  thought: IconBrain,
  action: IconTool,
  observation: IconEye,
  error: IconAlertCircle,
};

const TRACE_COLOR: Record<TraceEntryType, string> = {
  thought: "text-blue-500 bg-blue-500/10",
  action: "text-amber-500 bg-amber-500/10",
  observation: "text-emerald-500 bg-emerald-500/10",
  error: "text-red-500 bg-red-500/10",
};

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function relativeTime(ts: number) {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/* ────────────────────────────── tabs ────────────────────────────── */

type Tab = "tasks" | "traces" | "tokens";

const TABS: { key: Tab; label: string; Icon: typeof IconActivity }[] = [
  { key: "tasks", label: "Tasks", Icon: IconMessageCircle },
  { key: "traces", label: "Traces", Icon: IconActivity },
  { key: "tokens", label: "Tokens", Icon: IconCoin },
];

/* ────────────────────────────── main ────────────────────────────── */

export function AgentDashboard() {
  const [tab, setTab] = useState<Tab>("tasks");
  const bgTaskCount = useBackgroundTasksStore(
    (s) =>
      Object.values(s.tasks).filter(
        (t) => t.status === "running" || t.status === "waiting_approval",
      ).length,
  );

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b px-2">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
            {key === "tasks" && bgTaskCount > 0 && (
              <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {bgTaskCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "tasks" && <BackgroundTasksTab />}
        {tab === "traces" && <TracesTab />}
        {tab === "tokens" && <TokensTab />}
      </div>
    </div>
  );
}

/* ───────────────── Tab 1 – Background Tasks ───────────────── */

function BackgroundTasksTab() {
  const tasks = useBackgroundTasksStore(
    useShallow((s) => Object.values(s.tasks)),
  );
  const removeTask = useBackgroundTasksStore((s) => s.removeTask);
  const clearCompleted = useBackgroundTasksStore((s) => s.clearCompleted);

  const activeTasks = tasks.filter(
    (t) => t.status === "running" || t.status === "waiting_approval",
  );
  const completedTasks = tasks.filter(
    (t) => t.status === "completed" || t.status === "error",
  );

  if (tasks.length === 0) {
    return (
      <div className="py-8 text-center">
        <IconActivity className="size-8 mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-xs text-muted-foreground">
          Background tasks will appear here when you start a new chat while
          another is running.
        </p>
      </div>
    );
  }

  const goToChat = (task: BackgroundTask) => {
    // Always dispatch – pass taskId so the handler can attach even when convId is null
    window.dispatchEvent(
      new CustomEvent("agent:goto-conversation", {
        detail: {
          conversationId: task.conversationId ?? undefined,
          taskId: task.taskId,
        },
      }),
    );
  };

  return (
    <div className="space-y-3">
      {/* Active */}
      {activeTasks.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Running
          </span>
          {activeTasks.map((t) => (
            <div
              key={t.taskId}
              className="rounded-lg border p-3 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    t.status === "running"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-amber-500/10 text-amber-600",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      t.status === "running"
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-amber-500",
                    )}
                  />
                  {t.status === "waiting_approval"
                    ? "Needs Approval"
                    : "Running"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {relativeTime(t.startedAt)}
                </span>
              </div>
              <p className="line-clamp-2 text-foreground">{t.userMessage}</p>

              {/* Waiting_approval: direct the user to the chat for full configuration */}
              {t.status === "waiting_approval" &&
                t.pendingApprovals.length > 0 && (
                  <button
                    onClick={() => goToChat(t)}
                    className="w-full flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-left hover:bg-amber-500/10 transition-colors"
                  >
                    <IconAlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        {t.pendingApprovals.length === 1
                          ? `Review & approve: ${t.pendingApprovals[0].toolName}`
                          : `${t.pendingApprovals.length} approvals needed`}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        Open chat to configure and approve
                      </p>
                    </div>
                    <IconExternalLink className="size-3.5 text-muted-foreground shrink-0" />
                  </button>
                )}

              {t.taskPlan && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span>
                    Steps:{" "}
                    {
                      t.taskPlan.steps.filter((s) => s.status === "completed")
                        .length
                    }
                    /{t.taskPlan.steps.length}
                  </span>
                </div>
              )}

              <button
                onClick={() => goToChat(t)}
                className="flex items-center gap-1 text-primary hover:underline text-[11px]"
              >
                <IconExternalLink className="size-3" />
                Open Chat
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Completed */}
      {completedTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Completed
            </span>
            <button
              onClick={clearCompleted}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          </div>
          {completedTasks.map((t) => (
            <div
              key={t.taskId}
              className="rounded-lg border border-dashed p-2.5 space-y-1 text-xs opacity-70"
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    t.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-red-500/10 text-red-600",
                  )}
                >
                  {t.status === "completed" ? "Done" : "Error"}
                </span>
                <button
                  onClick={() => removeTask(t.taskId)}
                  className="p-0.5 rounded hover:bg-muted transition-colors"
                >
                  <IconTrash className="size-3 text-muted-foreground" />
                </button>
              </div>
              <p className="line-clamp-1 text-foreground">{t.userMessage}</p>
              {t.conversationId && (
                <button
                  onClick={() => goToChat(t)}
                  className="flex items-center gap-1 text-primary hover:underline text-[11px]"
                >
                  <IconExternalLink className="size-3" />
                  View
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────── Tab 2 – Real-time Traces ───────────────── */

/* ── Step status icons for DAG view ── */

const STEP_STATUS_CFG: Record<
  TaskStatus,
  { icon: typeof IconCircleCheck; color: string; bg: string }
> = {
  [TASK_STATUS.PENDING]: {
    icon: IconCircleDashed,
    color: "text-muted-foreground",
    bg: "bg-muted/40",
  },
  [TASK_STATUS.IN_PROGRESS]: {
    icon: IconLoader2,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  [TASK_STATUS.COMPLETED]: {
    icon: IconCircleCheck,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  [TASK_STATUS.FAILED]: {
    icon: IconCircleX,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  [TASK_STATUS.SKIPPED]: {
    icon: IconPlayerSkipForward,
    color: "text-muted-foreground",
    bg: "bg-muted/40",
  },
};

/** Compute topological batch levels from dependencies. Steps in the same level can run in parallel. */
function computeBatchLevels(
  steps: TaskStep[],
): { level: number; stepIds: number[] }[] {
  const levelMap = new Map<number, number>();
  const stepMap = new Map<number, TaskStep>();
  for (const s of steps) stepMap.set(s.id, s);

  function getLevel(id: number): number {
    if (levelMap.has(id)) return levelMap.get(id)!;
    const step = stepMap.get(id);
    if (!step || !step.dependencies || step.dependencies.length === 0) {
      levelMap.set(id, 0);
      return 0;
    }
    const maxDepLevel = Math.max(
      ...step.dependencies.map((depId) => getLevel(depId)),
    );
    const lv = maxDepLevel + 1;
    levelMap.set(id, lv);
    return lv;
  }

  for (const s of steps) getLevel(s.id);

  // Group by level
  const grouped = new Map<number, number[]>();
  for (const [id, lv] of levelMap) {
    if (!grouped.has(lv)) grouped.set(lv, []);
    grouped.get(lv)!.push(id);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .map(([level, stepIds]) => ({
      level,
      stepIds: stepIds.sort((a, b) => a - b),
    }));
}

/** A single step node in the DAG */
function DAGStepNode({
  step,
  isExpanded,
  onToggle,
  traces,
}: {
  step: TaskStep;
  isExpanded: boolean;
  onToggle: () => void;
  traces: TraceEntry[];
}) {
  const cfg =
    STEP_STATUS_CFG[step.status] || STEP_STATUS_CFG[TASK_STATUS.PENDING];
  const Icon = cfg.icon;
  const isSpinning = step.status === TASK_STATUS.IN_PROGRESS;

  return (
    <div className={cn("rounded-lg border overflow-hidden", cfg.bg)}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/30 transition-colors"
      >
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            cfg.color,
            isSpinning && "animate-spin",
          )}
        />
        <span className="text-[11px] font-medium flex-1 truncate">
          {step.title}
        </span>
        {step.agentType && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground px-1 py-0.5 rounded bg-background/50">
            {step.agentType}
          </span>
        )}
        {traces.length > 0 && (
          <>
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {traces.length}
            </span>
            {isExpanded ? (
              <IconChevronDown className="size-3 text-muted-foreground" />
            ) : (
              <IconChevronRight className="size-3 text-muted-foreground" />
            )}
          </>
        )}
      </button>

      {/* Expanded trace entries for this step */}
      {isExpanded && traces.length > 0 && (
        <div className="border-t bg-background/50 px-2 py-1.5 space-y-1">
          {traces.map((entry, i) => {
            const EntryIcon = TRACE_ICON[entry.type];
            const color = TRACE_COLOR[entry.type];
            return (
              <div key={i} className="flex gap-2 text-[11px]">
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full shrink-0 mt-0.5",
                    color,
                  )}
                >
                  <EntryIcon className="size-2.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-muted-foreground uppercase text-[9px] tracking-wider">
                    {entry.type}
                    {entry.toolName && ` — ${entry.toolName}`}
                  </span>
                  <p className="text-foreground whitespace-pre-wrap break-words leading-relaxed">
                    {entry.content}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TracesTab() {
  const { traceEntries, tokenExceeded, tokenExceededReason, taskPlan } =
    useAgentStore();
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (stepId: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  // Group traces by stepId
  const tracesByStep = useMemo(() => {
    const map = new Map<number | "ungrouped", TraceEntry[]>();
    for (const entry of traceEntries) {
      const key = entry.stepId ?? "ungrouped";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return map;
  }, [traceEntries]);

  // Compute batch levels from the plan
  const batchLevels = useMemo(() => {
    if (!taskPlan || !taskPlan.steps.length) return [];
    return computeBatchLevels(taskPlan.steps);
  }, [taskPlan]);

  const hasPlan = taskPlan && taskPlan.steps.length > 0;
  const hasTraces = traceEntries.length > 0;

  if (!hasPlan && !hasTraces && !tokenExceeded) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        Traces will appear here during execution and are saved per conversation.
      </p>
    );
  }

  // Step lookup
  const stepMap = new Map<number, TaskStep>();
  if (taskPlan) {
    for (const s of taskPlan.steps) stepMap.set(s.id, s);
  }

  return (
    <div className="space-y-3">
      {tokenExceeded && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50 p-2.5 text-xs">
          <IconAlertTriangle className="size-4 shrink-0 text-red-500 mt-0.5" />
          <div>
            <p className="font-medium text-red-800 dark:text-red-200">
              Token Budget Exceeded
            </p>
            {tokenExceededReason && (
              <p className="mt-0.5 text-red-700 dark:text-red-300">
                {tokenExceededReason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* DAG Visualization */}
      {hasPlan && batchLevels.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Execution DAG
          </span>

          <div className="space-y-2">
            {batchLevels.map((batch, batchIdx) => (
              <div key={batchIdx}>
                {/* Batch header — show parallel icon if >1 step in batch */}
                {batch.stepIds.length > 1 && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <IconArrowsSplit className="size-3 text-blue-500" />
                    <span className="text-[9px] text-blue-500 font-medium uppercase tracking-wider">
                      Parallel Batch {batchIdx + 1}
                    </span>
                    <div className="flex-1 h-px bg-blue-500/20" />
                  </div>
                )}

                {/* Steps in this batch — shown side by side if parallel */}
                <div
                  className={cn(
                    "gap-1.5",
                    batch.stepIds.length > 1
                      ? "grid grid-cols-2"
                      : "flex flex-col",
                  )}
                >
                  {batch.stepIds.map((stepId) => {
                    const step = stepMap.get(stepId);
                    if (!step) return null;
                    const stepTraces = tracesByStep.get(stepId) || [];
                    return (
                      <DAGStepNode
                        key={stepId}
                        step={step}
                        isExpanded={expandedSteps.has(stepId)}
                        onToggle={() => toggleStep(stepId)}
                        traces={stepTraces}
                      />
                    );
                  })}
                </div>

                {/* Arrow between batches */}
                {batchIdx < batchLevels.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <div className="w-px h-3 bg-border" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ungrouped traces (no plan, or traces without stepId) */}
      {(!hasPlan || tracesByStep.has("ungrouped")) && (
        <div className="space-y-1.5">
          {hasPlan && tracesByStep.has("ungrouped") && (
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              General Traces
            </span>
          )}

          <div className="relative pl-5">
            {/* Vertical connector line */}
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

            {(hasPlan ? tracesByStep.get("ungrouped") || [] : traceEntries).map(
              (entry, i) => {
                const Icon = TRACE_ICON[entry.type];
                const color = TRACE_COLOR[entry.type];
                return (
                  <div key={i} className="relative flex gap-2.5 pb-3 last:pb-0">
                    <div
                      className={cn(
                        "relative z-10 flex size-5 items-center justify-center rounded-full shrink-0",
                        color,
                      )}
                    >
                      <Icon className="size-3" />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {entry.type}
                          {entry.toolName && ` — ${entry.toolName}`}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                          {relativeTime(entry.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap break-words">
                        {entry.content}
                      </p>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────── Tab 3 – Token Budget ───────────────── */

function TokensTab() {
  const { taskTokens, tokenWarning } = useAgentStore();
  const [daily, setDaily] = useState<TokenUsage | null>(null);
  const [budget, setBudget] = useState<UserTokenBudget | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Fetch on mount
  useEffect(() => {
    agentService
      .getTokenUsage()
      .then((r) => setDaily(r.data?.daily ?? null))
      .catch(() => {});
    agentService
      .getTokenBudget()
      .then((r) => setBudget(r.data?.budget ?? null))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!budget) return;
    setSaving(true);
    try {
      const res = await agentService.updateTokenBudget(budget);
      setBudget(res.data?.budget ?? budget);
      setDirty(false);
    } catch {
      /* swallow */
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof UserTokenBudget>(
    key: K,
    value: UserTokenBudget[K],
  ) => {
    setBudget((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      {/* Live counters */}
      <div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Current Session
        </span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <StatCard
            label="Task Tokens"
            value={fmtTokens(taskTokens)}
            warning={tokenWarning}
          />
          <StatCard
            label="Daily Tokens"
            value={daily ? fmtTokens(daily.totalTokens) : "—"}
          />
        </div>
      </div>

      {/* Budget settings */}
      {budget && (
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Budget Settings
          </span>
          <div className="mt-2 space-y-3">
            <NumberField
              label="Max tokens / task"
              value={budget.maxTokensPerTask}
              onChange={(v) => updateField("maxTokensPerTask", v)}
            />
            <NumberField
              label="Max tokens / day"
              value={budget.maxTokensPerDay}
              onChange={(v) => updateField("maxTokensPerDay", v)}
            />
            <NumberField
              label="Warning threshold (%)"
              value={budget.warningThresholdPct}
              onChange={(v) => updateField("warningThresholdPct", v)}
              min={0}
              max={100}
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={budget.pauseOnWarning}
                onChange={(e) =>
                  updateField("pauseOnWarning", e.target.checked)
                }
                className="rounded"
              />
              Pause on warning
            </label>

            {dirty && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Budget"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────── small helpers ───────────────── */

function StatCard({
  label,
  value,
  warning,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 text-center",
        warning &&
          "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
      )}
    >
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 rounded-md border bg-background px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}
