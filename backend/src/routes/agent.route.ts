import { Router } from "express";
import { AgentController } from "../controllers/agent.controller";
import { jwtAuth } from "../middlewares/auth.middleware";

export function createAgentRouter(agentController: AgentController): Router {
  const router = Router();

  // Agent 需要认证
  router.use(jwtAuth);

  router.get("/status", agentController.getStatus.bind(agentController));
  router.post("/chat", agentController.chat.bind(agentController));
  router.get(
    "/conversations",
    agentController.listConversations.bind(agentController),
  );
  router.get(
    "/conversations/:conversationId",
    agentController.getConversation.bind(agentController),
  );
  router.delete(
    "/conversations/:conversationId",
    agentController.deleteConversation.bind(agentController),
  );

  return router;
}
