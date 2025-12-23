import { QUEUE_ACTIONS, QUEUE_TASKS } from "../types/model.types";
import { maintainanceQueue } from "./queue/queue";

export async function initScheduledJobs() {
  await maintainanceQueue.add(
    QUEUE_TASKS.CLEANUP_TRASH,
    { action: QUEUE_ACTIONS.EMPTY_TRASH },
    { repeat: { pattern: "0 3 * * *" } }
  );

  await maintainanceQueue.add(
    QUEUE_TASKS.CLEANUP_TEMP_FILES,
    {},
    { repeat: { every: 60 * 60 * 1000 } } // 1h
  );
}
