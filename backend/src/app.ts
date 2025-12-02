import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env";
import { notFound } from "./middlewares/notFound";
import { errorHandler } from "./middlewares/errorHandler";
import { requestLogger } from "./middlewares/requestLogger";
import { createAuthRouter } from "./routes/auth.route.js";
import { createUserRouter } from "./routes/user.route.js";
import { createFileRouter } from "./routes/file.route.js";
import { AvatarService } from "./services/avatar.service";
import { UserService } from "./services/user.service";
import { AuthService } from "./services/auth.service";
import { AuthController } from "./controllers/auth.controller";
import { UserController } from "./controllers/user.controller";
import { FileService } from "./services/file.service";
import { FileController } from "./controllers/file.controller";
import { FolderService } from "./services/folder.service";
import { FolderController } from "./controllers/folder.controller";
import { createFolderRouter } from "./routes/folder.route";

const avatarService = new AvatarService();
const userService = new UserService(avatarService);
const authService = new AuthService(userService);
const authController = new AuthController(authService);
const userController = new UserController(userService);

const fileService = new FileService();
const fileController = new FileController(fileService);
const folderService = new FolderService();
const folderController = new FolderController(folderService);

const app: Application = express();
const bodyLimit = "10mb";
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);
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
app.use("/api/files", createFileRouter(fileController));
app.use("/api/folders", createFolderRouter(folderController));

app.use(notFound);
app.use(errorHandler);

export default app;
