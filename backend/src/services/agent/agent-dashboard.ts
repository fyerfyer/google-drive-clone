import { redisClient } from "../../config/redis";
import { logger } from "../../lib/logger";
import {
  ActiveChat,
  TokenUsage,
  UserTokenBudget,
  DEFAULT_TOKEN_BUDGET,
} from "./agent.types";
import { agentTaskQueue } from "./agent-task-queue";

const KEY_PREFIX = "agent:dashboard:";

const taskTokensKey = (taskId: string) => `${KEY_PREFIX}task_tokens:${taskId}`;

const dailyTokensKey = (userId: string) => {
  const today = new Date().toISOString().slice(0, 10);
  return `${KEY_PREFIX}daily_tokens:${userId}:${today}`;
};

const budgetKey = (userId: string) => `${KEY_PREFIX}budget:${userId}`;
const traceKey = (taskId: string) => `${KEY_PREFIX}traces:${taskId}`;

export const userActiveTasksKey = (userId: string) =>
  `${KEY_PREFIX}active_tasks:${userId}`;

const TRACE_TTL = 3600; // 1 h
const TOKEN_COUNTER_TTL = 86400; // 24 h

export async function getActiveChats(userId: string): Promise<ActiveChat[]> {
  const results: ActiveChat[] = [];

  // 获取用户活跃任务 ID 列表
  const taskIds = await redisClient.smembers(userActiveTasksKey(userId));
  if (taskIds.length === 0) return [];

  const jobs = await Promise.all(
    taskIds.map((id) => agentTaskQueue.getJob(id)),
  );

  const cleanupTasks: string[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const taskId = taskIds[i];

    if (!job) {
      cleanupTasks.push(taskId);
      continue;
    }

    const state = await job.getState();

    let tokenUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    try {
      const data = await redisClient.hgetall(taskTokensKey(job.data.taskId));
      if (data && data.totalTokens) {
        tokenUsage = {
          promptTokens: parseInt(data.promptTokens || "0", 10),
          completionTokens: parseInt(data.completionTokens || "0", 10),
          totalTokens: parseInt(data.totalTokens || "0", 10),
        };
      }
    } catch (err) {
      logger.warn(
        { err, taskId: job.data.taskId },
        "Failed to fetch token usage for dashboard",
      );
    }

    results.push({
      taskId: job.data.taskId,
      conversationId: job.data.conversationId,
      message: job.data.message.slice(0, 120),
      agentType: job.data.context?.type,
      status: state === "active" ? "running" : "queued",
      startedAt: job.timestamp || Date.now(),
      tokenUsage,
    });
  }

  // 异步清理失效的 ID
  if (cleanupTasks.length > 0) {
    redisClient
      .srem(userActiveTasksKey(userId), ...cleanupTasks)
      .catch(() => {});
  }

  return results.sort((a, b) => b.startedAt - a.startedAt);
}

export async function recordTokenUsage(
  taskId: string,
  userId: string,
  usage: TokenUsage,
): Promise<TokenUsage> {
  const taskKey = taskTokensKey(taskId);
  const dayKey = dailyTokensKey(userId);

  const pipe = redisClient.pipeline();
  pipe.hincrby(taskKey, "promptTokens", usage.promptTokens);
  pipe.hincrby(taskKey, "completionTokens", usage.completionTokens);
  pipe.hincrby(taskKey, "totalTokens", usage.totalTokens);
  pipe.expire(taskKey, TOKEN_COUNTER_TTL);

  pipe.hincrby(dayKey, "promptTokens", usage.promptTokens);
  pipe.hincrby(dayKey, "completionTokens", usage.completionTokens);
  pipe.hincrby(dayKey, "totalTokens", usage.totalTokens);
  pipe.expire(dayKey, TOKEN_COUNTER_TTL);

  const results = await pipe.exec();

  const taskTotal: TokenUsage = {
    promptTokens: (results?.[0]?.[1] as number) || 0,
    completionTokens: (results?.[1]?.[1] as number) || 0,
    totalTokens: (results?.[2]?.[1] as number) || 0,
  };

  return taskTotal;
}

export async function getTaskTokenUsage(taskId: string): Promise<TokenUsage> {
  const data = await redisClient.hgetall(taskTokensKey(taskId));
  return {
    promptTokens: parseInt(data.promptTokens || "0", 10),
    completionTokens: parseInt(data.completionTokens || "0", 10),
    totalTokens: parseInt(data.totalTokens || "0", 10),
  };
}

export async function getDailyTokenUsage(userId: string): Promise<TokenUsage> {
  const data = await redisClient.hgetall(dailyTokensKey(userId));
  return {
    promptTokens: parseInt(data.promptTokens || "0", 10),
    completionTokens: parseInt(data.completionTokens || "0", 10),
    totalTokens: parseInt(data.totalTokens || "0", 10),
  };
}

export async function getUserTokenBudget(
  userId: string,
): Promise<UserTokenBudget> {
  const data = await redisClient.get(budgetKey(userId));
  if (!data) return { ...DEFAULT_TOKEN_BUDGET };
  try {
    return { ...DEFAULT_TOKEN_BUDGET, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULT_TOKEN_BUDGET };
  }
}

export async function setUserTokenBudget(
  userId: string,
  budget: Partial<UserTokenBudget>,
): Promise<UserTokenBudget> {
  const current = await getUserTokenBudget(userId);
  const updated = { ...current, ...budget };
  await redisClient.set(budgetKey(userId), JSON.stringify(updated));
  return updated;
}

export interface BudgetCheckResult {
  allowed: boolean;
  warning: boolean;
  reason?: string;
  taskTokens: number;
  dailyTokens: number;
  taskLimit: number;
  dailyLimit: number;
}

export async function checkTokenBudget(
  taskId: string,
  userId: string,
): Promise<BudgetCheckResult> {
  const [budget, taskUsage, dailyUsage] = await Promise.all([
    getUserTokenBudget(userId),
    getTaskTokenUsage(taskId),
    getDailyTokenUsage(userId),
  ]);

  const result: BudgetCheckResult = {
    allowed: true,
    warning: false,
    taskTokens: taskUsage.totalTokens,
    dailyTokens: dailyUsage.totalTokens,
    taskLimit: budget.maxTokensPerTask,
    dailyLimit: budget.maxTokensPerDay,
  };

  if (budget.maxTokensPerTask > 0) {
    if (taskUsage.totalTokens >= budget.maxTokensPerTask) {
      result.allowed = false;
      result.reason = `Task token limit exceeded (${taskUsage.totalTokens}/${budget.maxTokensPerTask})`;
      return result;
    }
    const pct = (taskUsage.totalTokens / budget.maxTokensPerTask) * 100;
    if (pct >= budget.warningThresholdPct) {
      result.warning = true;
      if (budget.pauseOnWarning) {
        result.allowed = false;
        result.reason = `Task token usage at ${Math.round(pct)}% of limit — paused (${taskUsage.totalTokens}/${budget.maxTokensPerTask})`;
        return result;
      }
    }
  }

  if (budget.maxTokensPerDay > 0) {
    if (dailyUsage.totalTokens >= budget.maxTokensPerDay) {
      result.allowed = false;
      result.reason = `Daily token limit exceeded (${dailyUsage.totalTokens}/${budget.maxTokensPerDay})`;
      return result;
    }
    const pct = (dailyUsage.totalTokens / budget.maxTokensPerDay) * 100;
    if (pct >= budget.warningThresholdPct) {
      result.warning = true;
      if (budget.pauseOnWarning) {
        result.allowed = false;
        result.reason = `Daily token usage at ${Math.round(pct)}% of limit — paused (${dailyUsage.totalTokens}/${budget.maxTokensPerDay})`;
        return result;
      }
    }
  }

  return result;
}

export async function appendTrace(
  taskId: string,
  entry: { type: string; content: string; stepId?: number; toolName?: string },
): Promise<void> {
  const key = traceKey(taskId);
  const record = {
    ...entry,
    timestamp: Date.now(),
  };
  await redisClient.rpush(key, JSON.stringify(record));
  await redisClient.expire(key, TRACE_TTL);
}

export async function getTraces(taskId: string): Promise<
  Array<{
    type: string;
    content: string;
    timestamp: number;
    stepId?: number;
    toolName?: string;
  }>
> {
  const key = traceKey(taskId);
  const items = await redisClient.lrange(key, 0, -1);
  return items.map((item) => JSON.parse(item));
}
