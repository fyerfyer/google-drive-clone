import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FileService } from "../services/file.service";
import { FolderService } from "../services/folder.service";
import { ShareService } from "../services/share.service";
import { PermissionService } from "../services/permission.service";
import { registerWorkspaceResources } from "./resources";
import {
  registerAuthTools,
  createAuthContext,
  McpAuthContext,
} from "./auth/auth";
import { logger } from "../lib/logger";
import { KnowledgeService } from "../services/knowledge.service";
import {
  registerKnowledgeTools,
  registerFileTools,
  registerFolderTools,
  registerSearchTools,
  registerShareTools,
  registerDocumentTools,
} from "./tools";

export interface McpServices {
  fileService: FileService;
  folderService: FolderService;
  shareService: ShareService;
  permissionService: PermissionService;
  knowledgeService: KnowledgeService;
}

export function createMcpServer(
  services: McpServices,
  authContext?: McpAuthContext,
): McpServer {
  const server = new McpServer({
    name: "gdrive-mcp-server",
    version: "1.0.0",
  });

  // 每个 MCP session 维护独立的认证上下文
  const ctx = authContext || createAuthContext();

  logger.info("Initializing MCP Server with capabilities...");

  // 认证工具
  registerAuthTools(server, ctx);

  registerFileTools(server, services, ctx);
  registerFolderTools(server, services, ctx);
  registerShareTools(server, services, ctx);
  registerSearchTools(server, services, ctx);

  // Knowledge Layer
  registerKnowledgeTools(server, services.knowledgeService, ctx);

  registerDocumentTools(server, services, ctx);

  registerWorkspaceResources(server, services);

  logger.info("MCP Server capabilities registered successfully");

  return server;
}
