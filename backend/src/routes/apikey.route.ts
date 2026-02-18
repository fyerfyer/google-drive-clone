import { Router } from "express";
import { jwtAuth } from "../middlewares/auth.middleware";
import { ApiKeyController } from "../controllers/apikey.controller";

export function createApiKeyRouter(apiKeyController: ApiKeyController) {
  const router = Router();

  // 所有 API Key 操作都需要 JWT 认证
  router.use(jwtAuth);

  router.post("/", apiKeyController.createApiKey.bind(apiKeyController));
  router.get("/", apiKeyController.listApiKeys.bind(apiKeyController));
  router.delete(
    "/:keyId",
    apiKeyController.revokeApiKey.bind(apiKeyController),
  );
  router.delete(
    "/:keyId/permanent",
    apiKeyController.deleteApiKey.bind(apiKeyController),
  );

  return router;
}
