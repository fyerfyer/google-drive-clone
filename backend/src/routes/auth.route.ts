import { Router } from "express";
import { jwtAuth } from "../middlewares/auth.middleware.js";
import {
  loginValidator,
  registerValidator,
  updateValidator,
} from "../middlewares/validator.js";
import upload from "../middlewares/upload.js";
import { AuthController } from "../controllers/auth.controller.js";

// using shared `upload` middleware from `middlewares/upload.ts`

// const authRouter = Router();

// authRouter.post("/register", registerValidator, register);
// authRouter.post("/login", loginValidator, login);

// authRouter.use(jwtAuth);
// authRouter.post("/logout", logout);
// authRouter.get("/profile", getCurrentUser);
// authRouter.patch(
//   "/update",
//   upload.single("avatar"),
//   updateValidator,
//   updataUser
// );

export function createAuthRouter(authController: AuthController) {
  const authRouter = Router();
  authRouter.post(
    "/register",
    upload.single("avatar"),
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
  authRouter.get(
    "/profile",
    authController.getCurrentUser.bind(authController)
  );
  authRouter.patch(
    "/update",
    upload.single("avatar"),
    updateValidator,
    authController.updateUser.bind(authController)
  );
  return authRouter;
}
