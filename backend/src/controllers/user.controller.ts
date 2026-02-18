import { Request, Response, NextFunction } from "express";
import {
  UserService,
  IUserPublic,
  toPublicUser,
} from "../services/user.service";
import { IUser } from "../models/User.model";
import { ResponseHelper } from "../utils/response.util";
import { UserResponse, UsersSearchResponse } from "../types/response.types";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";

export class UserController {
  constructor(private userService: UserService) {}

  getCurrentUser(req: Request, res: Response) {
    const user = toPublicUser(req.user! as IUser);
    return ResponseHelper.ok<UserResponse>(res, { user: user });
  }

  async searchUsers(req: Request, res: Response, next: NextFunction) {
    const { email } = req.query;
    const currentUserId = req.user!.id;

    if (!email || typeof email !== "string") {
      throw new AppError(StatusCodes.BAD_REQUEST, "Email query is required");
    }

    const users = await this.userService.searchUsersByEmail(
      email,
      currentUserId,
    );
    const publicUsers = users.map((u) => toPublicUser(u));
    return ResponseHelper.ok<UsersSearchResponse>(res, { users: publicUsers });
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!.id;
    const { name, email } = req.body;
    const updates: Partial<{ name: string; email: string }> = {};
    if (name) updates.name = name;
    if (email) updates.email = email;

    const updatedUser = await this.userService.updateUser(userId, updates);
    const user = toPublicUser(updatedUser);
    return ResponseHelper.ok<UserResponse>(res, { user: user });
  }

  async updateAvatar(req: Request, res: Response, next: NextFunction) {
    const userId = req.user!.id;
    const { key } = req.body;

    if (!key) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Avatar key is required");
    }

    const updatedUser = await this.userService.updateAvatar(userId, key);
    const user = toPublicUser(updatedUser);
    return ResponseHelper.success<UserResponse>(
      res,
      { user: user },
      StatusCodes.OK,
      "Avatar updated successfully",
    );
  }
}
