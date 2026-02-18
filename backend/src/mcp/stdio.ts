// 独立的 MCP stdio Server，用于 VSCode / Claude Desktop 等 Client 访问
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, McpServices } from "./server";
import { createAuthContext, authenticateWithApiKey } from "./auth/auth";
import { FileService } from "../services/file.service";
import { FolderService } from "../services/folder.service";
import { ShareService } from "../services/share.service";
import { PermissionService } from "../services/permission.service";
import { KnowledgeService } from "../services/knowledge.service";
import { connectDB } from "../config/database";
import { ensureCollection as ensureQdrantCollection } from "../config/qdrant";
import { logger } from "../lib/logger";

async function main() {
  try {
    await connectDB();
    logger.info("Database connected for MCP stdio server");

    // 初始化 Qdrant collection
    try {
      await ensureQdrantCollection();
      logger.info("Qdrant collection initialized");
    } catch (err) {
      logger.warn(
        { error: err },
        "Qdrant init failed, semantic search may not work",
      );
    }
  } catch (error) {
    console.error("Failed to connect to database:", error);
    process.exit(1);
  }

  const permissionService = new PermissionService();
  const fileService = new FileService(permissionService);
  const folderService = new FolderService();
  const shareService = new ShareService(permissionService);
  const knowledgeService = new KnowledgeService();

  const services: McpServices = {
    fileService,
    folderService,
    shareService,
    permissionService,
    knowledgeService,
  };

  // 创建认证上下文
  const authContext = createAuthContext();

  // 通过 MCP_API_KEY 环境变量自动认证
  const apiKey = process.env.MCP_API_KEY;

  if (apiKey) {
    try {
      const success = await authenticateWithApiKey(apiKey, authContext);
      if (success) {
        logger.info(
          {
            email: authContext.userEmail,
            userId: authContext.userId,
            keyName: authContext.keyName,
          },
          "MCP stdio auto-authenticated via MCP_API_KEY",
        );
      } else {
        logger.error(
          "MCP_API_KEY is invalid or expired. Please generate a new one in the Drive web UI.",
        );
      }
    } catch (error) {
      logger.error(
        { err: error },
        "Failed to auto-authenticate via MCP_API_KEY",
      );
    }
  }

  const server = createMcpServer(services, authContext);
  const transport = new StdioServerTransport();

  logger.info("Starting MCP stdio server...");
  await server.connect(transport);

  if (authContext.userId) {
    logger.info(
      {
        userId: authContext.userId,
        email: authContext.userEmail,
        name: authContext.userName,
        keyName: authContext.keyName,
      },
      "MCP stdio server running (authenticated)",
    );
  } else {
    logger.info(
      "MCP stdio server running. Call 'authenticate' tool with your API key to log in. " +
        "Or set MCP_API_KEY env var for auto-auth. " +
        "Generate keys at: Drive web UI > Settings > API Keys.",
    );
  }

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
