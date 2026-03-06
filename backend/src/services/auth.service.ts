import { getReasonPhrase, StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.util";
import { UserService, IUserPublic, toPublicUser } from "./user.service";
import { redisClient } from "../config/redis";

interface RegisterDTO {
  email: string;
  password: string;
  name: string;
  avatarDataUrl?: string;
}

interface LoginDTO {
  email: string;
  password: string;
}

interface AuthResponse {
  user: IUserPublic;
  token: string;
  refreshToken: string;
}

const REFRESH_TOKEN_PREFIX = "rt:";
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

export class AuthService {
  constructor(private userService: UserService) {}

  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    await redisClient.set(
      `${REFRESH_TOKEN_PREFIX}${userId}`,
      refreshToken,
      "EX",
      REFRESH_TOKEN_TTL,
    );
  }

  private async getStoredRefreshToken(userId: string): Promise<string | null> {
    return redisClient.get(`${REFRESH_TOKEN_PREFIX}${userId}`);
  }

  private async removeRefreshToken(userId: string): Promise<void> {
    await redisClient.del(`${REFRESH_TOKEN_PREFIX}${userId}`);
  }

  async register(data: RegisterDTO): Promise<AuthResponse> {
    const user = await this.userService.createUser({
      email: data.email,
      password: data.password,
      name: data.name,
    });

    const payload = { id: user.id, email: user.email };
    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await this.storeRefreshToken(user.id, refreshToken);

    return {
      user: toPublicUser(user),
      token,
      refreshToken,
    };
  }

  async login(data: LoginDTO): Promise<AuthResponse> {
    const user = await this.userService.getUserByEmail(data.email);
    if (!user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not found");
    }

    const isPasswordValid = await user.comparePassword(data.password);
    if (!isPasswordValid) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Incorrect password");
    }

    const payload = { id: user.id, email: user.email };
    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await this.storeRefreshToken(user.id, refreshToken);

    return {
      user: toPublicUser(user),
      token,
      refreshToken,
    };
  }

  async refresh(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken: string }> {
    const { id, email } = verifyRefreshToken(refreshToken);

    // 校验传入的 refresh token 是否与存储的匹配，防止被盗用后继续使用
    const storedToken = await this.getStoredRefreshToken(id);
    if (!storedToken || storedToken !== refreshToken) {
      // 如果不匹配，撤销该用户的所有 token
      await this.removeRefreshToken(id);
      throw new AppError(StatusCodes.UNAUTHORIZED, "Refresh token revoked");
    }

    const payload = { id, email };
    const newAccessToken = generateToken(payload);
    const newRefreshToken = generateRefreshToken(payload);
    await this.storeRefreshToken(id, newRefreshToken);

    return { token: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string): Promise<void> {
    await this.removeRefreshToken(userId);
  }
}
