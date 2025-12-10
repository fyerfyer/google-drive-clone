import { Router } from "express";
import { jwtAuth } from "../middlewares/auth.middleware.js";
import {
  loginValidator,
  registerValidator,
  updateValidator,
} from "../middlewares/validator.js";
import { AuthController } from "../controllers/auth.controller.js";

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
