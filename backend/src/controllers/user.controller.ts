import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { UserService, IUserPublic } from "../services/user.service";

export class UserController {
  constructor(private userService: UserService) {}

  getCurrentUser(req: Request, res: Response) {
    const currentUser = req.user!.toJSON() as IUserPublic;
    res.status(StatusCodes.OK).json({
      success: true,
      message: "User retrieved successfully",
      data: currentUser,
    });
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
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
      const userResponse = updatedUser.toJSON() as IUserPublic;
      res.status(StatusCodes.OK).json({
        success: true,
        message: "User updated successfully",
        data: userResponse,
      });
    } catch (error) {
      next(error);
    }
  }
}
