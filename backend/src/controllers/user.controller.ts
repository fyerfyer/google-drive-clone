import { Request, Response, NextFunction } from "express";
import { UserService, IUserPublic } from "../services/user.service";
import { ResponseHelper } from "../utils/response.util";
import { UserResponse } from "../types/response.types";

export class UserController {
  constructor(private userService: UserService) {}

  getCurrentUser(req: Request, res: Response) {
    const user = req.user!.toJSON() as IUserPublic;
    return ResponseHelper.ok<UserResponse>(res, { user: user });
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!.id;
    const { name, email } = req.body;
    const updates: Partial<{ name: string; email: string }> = {};
    if (name) updates.name = name;
    if (email) updates.email = email;

    // 如果有的话，上传用户选择的头像
    const avatarFile = req.file;
    const avatarDataUrl =
      typeof req.body.avatarDataUrl === "string"
        ? req.body.avatarDataUrl
        : undefined;

    const updatedUser = await this.userService.updateUser(
      userId,
      updates,
      avatarFile,
      avatarDataUrl
    );
    const user = updatedUser.toJSON() as IUserPublic;
    return ResponseHelper.ok<UserResponse>(res, { user: user });
  }
}
