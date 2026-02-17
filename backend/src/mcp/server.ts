import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FileService } from "../services/file.service";
import { FolderService } from "../services/folder.service";
import { ShareService } from "../services/share.service";
import { PermissionService } from "../services/permission.service";
import {
  registerFileTools,
  registerFolderTools,
  registerShareTools,
  registerSearchTools,
} from "./tools";
import { registerWorkspaceResources } from "./resources";
import { logger } from "../lib/logger";

export interface McpServices {
  fileService: FileService;
  folderService: FolderService;
  shareService: ShareService;
  permissionService: PermissionService;
}

export function createMcpServer(services: McpServices): McpServer {
  const server = new McpServer({
    name: "gdrive-mcp-server",
    version: "1.0.0",
  });

  logger.info("Initializing MCP Server with capabilities...");

  registerFileTools(server, services);
  registerFolderTools(server, services);
  registerShareTools(server, services);
  registerSearchTools(server, services);
  registerWorkspaceResources(server, services);

  logger.info("MCP Server capabilities registered successfully");

  return server;
}
