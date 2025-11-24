import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config/env";
import { notFound } from "./middlewares/notFound";
import { errorHandler } from "./middlewares/errorHandler";
import { createAuthRouter } from "./routes/auth.route.js";
import { AvatarService } from "./services/avatar.service";
import { UserService } from "./services/user.service";
import { AuthService } from "./services/auth.service";
import { AuthController } from "./controllers/auth.controller";

const avatarService = new AvatarService();
const userService = new UserService(avatarService);
const authService = new AuthService(userService);
const authController = new AuthController(authService, userService);

const app: Application = express();
const bodyLimit = "10mb";
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);
app.use(helmet());
if (config.nodeEnv === "development") {
  app.use(morgan("dev"));
}

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

app.use(notFound);
app.use(errorHandler);

export default app;
