// 独立的 MCP stdio Server，用于 VSCode 等 Client 访问
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, McpServices } from "./server";
import { FileService } from "../services/file.service";
import { FolderService } from "../services/folder.service";
import { ShareService } from "../services/share.service";
import { PermissionService } from "../services/permission.service";
import { connectDB } from "../config/database";
import { logger } from "../lib/logger";

async function main() {
  try {
    await connectDB();
    logger.info("Database connected for MCP stdio server");
  } catch (error) {
    console.error("Failed to connect to database:", error);
    process.exit(1);
  }

  const permissionService = new PermissionService();
  const fileService = new FileService(permissionService);
  const folderService = new FolderService();
  const shareService = new ShareService(permissionService);

  const services: McpServices = {
    fileService,
    folderService,
    shareService,
    permissionService,
  };

  const server = createMcpServer(services);

  const transport = new StdioServerTransport();

  logger.info("Starting MCP stdio server...");

  await server.connect(transport);

  logger.info("MCP stdio server running. Waiting for input on stdin...");

  process.on("SIGINT", async () => {
    logger.info("Shutting down MCP stdio server...");
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("Shutting down MCP stdio server...");
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error starting MCP stdio server:", error);
  process.exit(1);
});
