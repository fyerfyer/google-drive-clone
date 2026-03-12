import { Router } from "express";
import { jwtAuth } from "../middlewares/auth.middleware";
import { loginValidator, registerValidator } from "../middlewares/validator";
import { AuthController } from "../controllers/auth.controller";
import { authLimiter } from "../middlewares/rateLimiter";

export function createAuthRouter(authController: AuthController) {
  const authRouter = Router();

  authRouter.post(
    "/register",
    authLimiter,
    registerValidator,
    authController.register.bind(authController),
  );
  authRouter.post(
    "/login",
    authLimiter,
    loginValidator,
    authController.login.bind(authController),
  );

  authRouter.post("/refresh", authController.refresh.bind(authController));

  authRouter.use(jwtAuth);
  authRouter.post("/logout", authController.logout.bind(authController));

  // Session 与 Device 管理
  authRouter.get("/sessions", authController.getSessions.bind(authController));
  authRouter.delete(
    "/sessions/:deviceId",
    authController.revokeSession.bind(authController),
  );

  return authRouter;
}
