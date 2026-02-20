import { Router } from "express";
import { AgentController } from "../controllers/agent.controller";
import { jwtAuth } from "../middlewares/auth.middleware";

export function createAgentRouter(agentController: AgentController): Router {
  const router = Router();

  // Agent 需要认证
  router.use(jwtAuth);

  // Status & capabilities
  router.get("/status", agentController.getStatus.bind(agentController));

  // Chat (supports context: { type, folderId, fileId })
  router.post("/chat", agentController.chat.bind(agentController));

  // Approval flow for dangerous operations
  router.get(
    "/approvals",
    agentController.getPendingApprovals.bind(agentController),
  );
  router.post(
    "/approve/:approvalId",
    agentController.resolveApproval.bind(agentController),
  );

  // Conversation management
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
