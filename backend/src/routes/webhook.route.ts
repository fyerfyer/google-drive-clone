import { Router } from "express";
import { WebhookController } from "../controllers/webhook.controller";
import { webhookAuth } from "../middlewares/webhook.middleware";

export function createWebhookRouter(webhookController: WebhookController) {
  const router = Router();

  router.post(
    "/s3",
    webhookAuth,
    webhookController.handleS3Event.bind(webhookController),
  );

  return router;
}
