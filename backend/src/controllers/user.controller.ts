import { Request, Response, NextFunction } from "express";
import { UserService, IUserPublic } from "../services/user.service";
import { ResponseHelper } from "../utils/response.util";
import { UserResponse } from "../types/response.types";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";

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

    const updatedUser = await this.userService.updateUser(userId, updates);
    const user = updatedUser.toJSON() as IUserPublic;
    return ResponseHelper.ok<UserResponse>(res, { user: user });
  }

  async updateAvatar(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!.id;
    const { key } = req.body;

    if (!key) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Avatar key is required");
    }

    const updatedUser = await this.userService.updateAvatar(userId, key);
    const user = updatedUser.toJSON() as IUserPublic;
    return ResponseHelper.success<UserResponse>(
      res,
      { user: user },
      StatusCodes.OK,
      "Avatar updated successfully"
    );
  }
}
