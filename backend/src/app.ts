import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env";
import { notFound } from "./middlewares/notFound";
import { errorHandler } from "./middlewares/errorHandler";
import { requestLogger } from "./middlewares/requestLogger";
import { createAuthRouter } from "./routes/auth.route";
import { createUserRouter } from "./routes/user.route";
import { createFileRouter } from "./routes/file.route";
import { UserService } from "./services/user.service";
import { AuthService } from "./services/auth.service";
import { AuthController } from "./controllers/auth.controller";
import { UserController } from "./controllers/user.controller";
import { FileService } from "./services/file.service";
import { FileController } from "./controllers/file.controller";
import { FolderService } from "./services/folder.service";
import { FolderController } from "./controllers/folder.controller";
import { createFolderRouter } from "./routes/folder.route";
import { createUploadRouter } from "./routes/upload.route";
import { UploadController } from "./controllers/upload.controller";
import { createBatchRouter } from "./routes/batch.routes";
import { BatchService } from "./services/batch.service";
import { BatchController } from "./controllers/batch.controller";
import { PermissionService } from "./services/permission.service";
import { ShareService } from "./services/share.service";
import { ShareController } from "./controllers/share.controller";
import { createShareRouter } from "./routes/share.route";
import { createMcpServer } from "./mcp/server";
import { createMcpRouter } from "./mcp/transport";

const userService = new UserService();
const authService = new AuthService(userService);
const authController = new AuthController(authService);
const userController = new UserController(userService);
const uploadController = new UploadController();
const permissionService = new PermissionService();

const fileService = new FileService(permissionService);
const fileController = new FileController(fileService);
const folderService = new FolderService();
const folderController = new FolderController(folderService);
const batchService = new BatchService();
const batchController = new BatchController(batchService);
const shareService = new ShareService(permissionService);
const shareController = new ShareController(shareService);

const app: Application = express();
const bodyLimit = "10mb";

// OnlyOffice CORS 服务 (office-content 和 office-callback)
app.use((req, res, next) => {
  if (
    req.path.includes("/office-content") ||
    req.path.includes("/office-callback")
  ) {
    // 由于已经设置了 Token 校验，这里全部放行
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    return next();
  }
  next();
});

// 前端 Global CORS 设置
app.use((req, res, next) => {
  if (
    req.path.includes("/office-content") ||
    req.path.includes("/office-callback")
  ) {
    return next();
  }
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })(req, res, next);
});
app.use(helmet());
app.use(requestLogger);

app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "MERN Drive API",
    version: "1.0.0",
  });
});

app.use("/api/auth", createAuthRouter(authController));
app.use("/api/users", createUserRouter(userController));
app.use("/api/files", createFileRouter(fileController, permissionService));
app.use(
  "/api/folders",
  createFolderRouter(folderController, permissionService),
);
app.use("/api/upload", createUploadRouter(uploadController));
app.use("/api/batch", createBatchRouter(batchController));
app.use("/api/share", createShareRouter(shareController));

// === MCP Server (AI Agent 能力暴露层) ===
const mcpServices = {
  fileService,
  folderService,
  shareService,
  permissionService,
};
const mcpRouter = createMcpRouter(() => createMcpServer(mcpServices));
app.use("/api/mcp", mcpRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
