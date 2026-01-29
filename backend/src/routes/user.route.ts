import { Router } from "express";
import { jwtAuth } from "../middlewares/auth.middleware";
import { updateValidator } from "../middlewares/validator";
import { UserController } from "../controllers/user.controller";

export function createUserRouter(userController: UserController) {
  const userRouter = Router();

  // 所有用户路由都需要认证
  userRouter.use(jwtAuth);

  userRouter.get(
    "/profile",
    userController.getCurrentUser.bind(userController),
  );

  userRouter.get("/search", userController.searchUsers.bind(userController));

  userRouter.patch(
    "/profile",
    updateValidator,
    userController.updateUser.bind(userController),
  );

  userRouter.patch("/avatar", userController.updateAvatar.bind(userController));

  return userRouter;
}
