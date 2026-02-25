import { createAgentTaskWorker } from "../../services/agent/agent-task-queue";
import { McpClientService } from "../../services/mcp-client.service";
import { AgentService } from "../../services/agent.service";
import { FileService } from "../../services/file.service";
import { FolderService } from "../../services/folder.service";
import { ShareService } from "../../services/share.service";
import { PermissionService } from "../../services/permission.service";
import { KnowledgeService } from "../../services/knowledge.service";
import { McpServices } from "../../mcp/server";
import { Worker } from "bullmq";
import logger from "../logger";

let worker: Worker | null = null;

// 内部创建独立的 service 实例以避免与 HTTP 请求链路共享状态
export function initAgentWorker(): void {
  if (worker) {
    logger.warn("Agent worker already initialized");
    return;
  }

  const permissionService = new PermissionService();
  const fileService = new FileService(permissionService);
  const folderService = new FolderService();
  const shareService = new ShareService(permissionService);
  const knowledgeService = new KnowledgeService();

  const mcpServices: McpServices = {
    fileService,
    folderService,
    shareService,
    permissionService,
    knowledgeService,
  };

  const mcpClient = new McpClientService(mcpServices);
  const agentService = new AgentService(mcpClient);
  const processor = agentService.buildTaskProcessor();

  worker = createAgentTaskWorker(processor);
  logger.info("Agent task BullMQ worker started");
}

export function getAgentWorker(): Worker | null {
  return worker;
}
