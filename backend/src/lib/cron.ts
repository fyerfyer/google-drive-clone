import { QUEUE_ACTIONS, QUEUE_TASKS } from "../types/model.types";
import { maintainanceQueue } from "./queue/queue";

export async function initScheduledJobs() {
  await maintainanceQueue.add(
    QUEUE_TASKS.CLEANUP_TRASH,
    { action: QUEUE_ACTIONS.EMPTY_TRASH },
    { repeat: { pattern: "0 3 * * *" } },
  );

  await maintainanceQueue.add(
    QUEUE_TASKS.CLEANUP_TEMP_FILES,
    {},
    { repeat: { every: 60 * 60 * 1000 } }, // 1h
  );

  // 每天凌晨 4 点清理超过 24h 未完成的分片上传，释放 MinIO 存储空间
  await maintainanceQueue.add(
    QUEUE_TASKS.CLEANUP_STALE_MULTIPARTS,
    {},
    { repeat: { pattern: "0 4 * * *" } },
  );
}
