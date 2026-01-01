import { Router } from "express";
import { jwtAuth } from "../middlewares/auth.middleware";
import {
  loginValidator,
  registerValidator,
  updateValidator,
} from "../middlewares/validator";
import { AuthController } from "../controllers/auth.controller";

export function createAuthRouter(authController: AuthController) {
  const authRouter = Router();

  authRouter.post(
    "/register",
    registerValidator,
    authController.register.bind(authController)
  );
  authRouter.post(
    "/login",
    loginValidator,
    authController.login.bind(authController)
  );

  authRouter.use(jwtAuth);
  authRouter.post("/logout", authController.logout.bind(authController));

  return authRouter;
}
