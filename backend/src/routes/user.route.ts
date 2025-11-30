import { Router } from "express";
import { jwtAuth } from "../middlewares/auth.middleware.js";
import { updateValidator } from "../middlewares/validator.js";
import { avatarUpload } from "../middlewares/upload.js";
import { UserController } from "../controllers/user.controller.js";

export function createUserRouter(userController: UserController) {
  const userRouter = Router();

  // 所有用户路由都需要认证
  userRouter.use(jwtAuth);

  userRouter.get(
    "/profile",
    userController.getCurrentUser.bind(userController)
  );
  userRouter.patch(
    "/profile",
    avatarUpload.single("avatar"),
    updateValidator,
    userController.updateUser.bind(userController)
  );

  return userRouter;
}
