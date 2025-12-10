import { getReasonPhrase, StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import User, { IUser } from "../models/User.model";
import { AvatarService } from "./avatar.service";

interface CreateUserDTO {
  email: string;
  password: string;
  name: string;
}

interface IUserAvatarDTO {
  url: string;
  thumbnail: string;
}

// 返回给前端的脱敏用户信息
export interface IUserPublic {
  id: string;
  email: string;
  name: string;
  avatar: IUserAvatarDTO;
  storageUsage: number;
  storageQuota: number;
  createdAt: Date;
  updatedAt: Date;
}

export class UserService {
  constructor(private avatarService: AvatarService) {}

  async createUser(data: CreateUserDTO): Promise<IUser> {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "User with email already exists"
      );
    }

    const user = await User.create({
      email: data.email,
      password: data.password,
      name: data.name,
    });

    return user;
  }

  async getUserById(userId: string): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        getReasonPhrase(StatusCodes.NOT_FOUND)
      );
    }

    return user;
  }

  async getUserByEmail(email: string): Promise<IUser | null> {
    const user = await User.findOne({ email }).select("+password");
    return user;
  }

  async updateUser(
    userId: string,
    updates: Partial<Pick<IUser, "name" | "email">>
  ): Promise<IUser> {
    if (updates.email) {
      const existingUser = await User.findOne({
        email: updates.email,
        _id: { $ne: userId },
      });
      if (existingUser) {
        throw new AppError(StatusCodes.BAD_REQUEST, "Email already in use");
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, "User not found");
    }

    return user;
  }

  async updateAvatar(userId: string, avatarKey: string): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, "User not found");
    }

    // Process and update avatar
    const newAvatar = await this.avatarService.processUploadAvatar(
      userId,
      avatarKey
    );

    // Delete old avatar if exists
    if (user.avatar?.publicId) {
      await this.avatarService.deleteAvatar(user.avatar.publicId);
    }

    user.avatar = {
      publicId: newAvatar.publicId,
      thumbnailId: newAvatar.thumbnailId,
      url: newAvatar.url,
      thumbnail: newAvatar.thumbnail,
      createdAt: new Date(),
    };

    await user.save();
    return user;
  }
}
