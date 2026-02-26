/**
 * 流程：
 *   1. HTTP 接收指令 -> 将任务放入 agentTaskQueue
 *   2. Worker 集群竞争执行任务
 *   3. Worker 通过 Redis Pub/Sub 将 SSE 事件实时推送
 *   4. 同进程 Socket.io 或 Pub/Sub 订阅器将事件转发给前端
 */

import { Queue, Worker, Job } from "bullmq";
import { redisClient, redisSubscriber } from "../../config/redis";
import { logger } from "../../lib/logger";
import { userActiveTasksKey } from "./agent-dashboard";
import {
  AgentType,
  AgentStreamEvent,
  AGENT_EVENT_TYPE,
  AgentTaskData,
  AgentTaskResult,
  AgentTaskStatusResponse,
  AGENT_TASK_STATUS,
} from "./agent.types";

export const AGENT_TASK_QUEUE_NAME = "agent-tasks";

const EVENT_CHANNEL_PREFIX = "agent:task:events:";

const TASK_RESULT_TTL = 300; // 5 minutes

const WORKER_CONCURRENCY = 3;

interface TaskEventEnvelope {
  taskId: string;
  userId: string;
  event: AgentStreamEvent;
}

export const agentTaskQueue = new Queue<AgentTaskData, AgentTaskResult>(
  AGENT_TASK_QUEUE_NAME,
  {
    connection: redisClient,
    defaultJobOptions: {
      attempts: 1, // Agent 任务不重试（LLM 调用不幂等）
      removeOnComplete: { age: TASK_RESULT_TTL, count: 200 },
      removeOnFail: { age: TASK_RESULT_TTL, count: 200 },
    },
  },
);

export function publishTaskEvent(
  taskId: string,
  userId: string,
  event: AgentStreamEvent,
): void {
  const channel = EVENT_CHANNEL_PREFIX + taskId;
  const envelope: TaskEventEnvelope = { taskId, userId, event };
  redisClient.publish(channel, JSON.stringify(envelope)).catch((err) => {
    logger.warn({ err, taskId }, "Failed to publish agent task event");
  });
}

type TaskEventHandler = (event: AgentStreamEvent) => void;

// 调度员存储：Channel -> 处理器集合
const taskEventHandlers = new Map<string, Set<TaskEventHandler>>();
let isTaskListenerAttached = false;

// 确保全局 eventListener 已挂载（只挂载一次）
function ensureTaskListenerAttached(): void {
  if (isTaskListenerAttached) return;
  isTaskListenerAttached = true;

  redisSubscriber.on("message", (channel, message) => {
    // 仅处理属于 Agent 任务事件的消息
    if (!channel.startsWith(EVENT_CHANNEL_PREFIX)) return;

    const handlers = taskEventHandlers.get(channel);
    if (!handlers || handlers.size === 0) return;

    try {
      const envelope = JSON.parse(message) as TaskEventEnvelope;
      handlers.forEach((handler) => handler(envelope.event));
    } catch (err) {
      logger.warn({ err, channel }, "Failed to dispatch task event");
    }
  });
}

// 订阅特定任务的事件流
export function subscribeTaskEvents(
  taskId: string,
  handler: TaskEventHandler,
): () => void {
  const channel = EVENT_CHANNEL_PREFIX + taskId;

  ensureTaskListenerAttached();

  // 1. 注册处理器
  if (!taskEventHandlers.has(channel)) {
    taskEventHandlers.set(channel, new Set());
    // 只有第一个订阅者需要真正执行 Redis SUBSCRIBE
    redisSubscriber.subscribe(channel).catch((err) => {
      logger.error({ err, channel }, "Failed to subscribe to Redis channel");
    });
  }
  taskEventHandlers.get(channel)!.add(handler);

  // 2. 返回清理函数
  return () => {
    const handlers = taskEventHandlers.get(channel);
    if (handlers) {
      handlers.delete(handler);
      // 如果没有活跃订阅者了，执行 UNSUBSCRIBE 释放资源
      if (handlers.size === 0) {
        taskEventHandlers.delete(channel);
        redisSubscriber.unsubscribe(channel).catch(() => {});
      }
    }
  };
}

export async function enqueueAgentTask(
  data: AgentTaskData,
): Promise<Job<AgentTaskData, AgentTaskResult>> {
  await redisClient.sadd(userActiveTasksKey(data.userId), data.taskId);

  const job = await agentTaskQueue.add("agent-chat", data, {
    jobId: data.taskId,
  });
  logger.info(
    { taskId: data.taskId, userId: data.userId },
    "Agent task enqueued",
  );
  return job;
}

export async function getAgentTaskStatus(
  taskId: string,
): Promise<AgentTaskStatusResponse> {
  const job = await agentTaskQueue.getJob(taskId);
  if (!job) {
    return { status: AGENT_TASK_STATUS.NOT_FOUND };
  }

  const state = await job.getState();
  switch (state) {
    case "completed":
      return { status: AGENT_TASK_STATUS.COMPLETED, result: job.returnvalue };
    case "failed":
      return { status: AGENT_TASK_STATUS.FAILED, error: job.failedReason };
    case "active":
      return { status: AGENT_TASK_STATUS.ACTIVE };
    default:
      return { status: AGENT_TASK_STATUS.PENDING };
  }
}

// 任务处理器类型。
// 由调用方（server.ts 或独立 worker 进程）注入实际的 AgentService 实例，
// processor 接收 AgentTaskData 和一个事件回调（用于 Pub/Sub 推送），
// 返回最终结果。
export type AgentTaskProcessor = (
  data: AgentTaskData,
  onEvent: (event: AgentStreamEvent) => void,
) => Promise<AgentTaskResult>;

export function createAgentTaskWorker(
  processor: AgentTaskProcessor,
): Worker<AgentTaskData, AgentTaskResult> {
  const worker = new Worker<AgentTaskData, AgentTaskResult>(
    AGENT_TASK_QUEUE_NAME,
    async (job: Job<AgentTaskData, AgentTaskResult>) => {
      const { taskId, userId } = job.data;

      logger.info({ taskId, userId, jobId: job.id }, "Processing agent task");

      // 构造 SSE 事件回调：通过 Pub/Sub 广播
      const onEvent = (event: AgentStreamEvent) => {
        publishTaskEvent(taskId, userId, event);
      };

      try {
        const result = await processor(job.data, onEvent);

        // 广播 DONE 事件
        publishTaskEvent(taskId, userId, {
          type: AGENT_EVENT_TYPE.DONE,
          data: result as unknown as Record<string, unknown>,
        });

        return result;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        logger.error({ error, taskId, userId }, "Agent task failed");

        // 广播 ERROR 事件
        publishTaskEvent(taskId, userId, {
          type: AGENT_EVENT_TYPE.ERROR,
          data: { message: errMsg },
        });

        throw error;
      }
    },
    {
      connection: redisClient,
      concurrency: WORKER_CONCURRENCY,
    },
  );

  worker.on("completed", (job) => {
    logger.info(
      { taskId: job.data.taskId, jobId: job.id },
      "Agent task completed",
    );
    redisClient
      .srem(userActiveTasksKey(job.data.userId), job.data.taskId)
      .catch(() => {});
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { taskId: job?.data.taskId, jobId: job?.id, error: err.message },
      "Agent task failed",
    );
    if (job) {
      redisClient
        .srem(userActiveTasksKey(job.data.userId), job.data.taskId)
        .catch(() => {});
    }
  });

  return worker;
}
