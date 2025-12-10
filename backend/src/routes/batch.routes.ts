import { Router } from "express";
import { BatchController } from "../controllers/batch.controller";
import { jwtAuth } from "../middlewares/auth.middleware";

export function createBatchRouter(batchController: BatchController) {
  const router = Router();

  router.use(jwtAuth);

  router.post("/trash", batchController.batchTrash.bind(batchController));

  router.post("/restore", batchController.batchRestore.bind(batchController));

  router.delete("/delete", batchController.batchDelete.bind(batchController));

  router.post("/move", batchController.batchMove.bind(batchController));

  router.post("/star", batchController.batchStar.bind(batchController));

  return router;
}
