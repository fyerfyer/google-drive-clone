import { getReasonPhrase, StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.util";
import { UserService, IUserPublic, toPublicUser } from "./user.service";
import { redisClient } from "../config/redis";
import { randomUUID } from "crypto";

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

export interface AuthResult {
  user: IUserPublic;
  token: string;
  refreshToken: string;
  deviceId: string;
}

export interface RefreshResult {
  token: string;
  refreshToken: string;
}

/** Stored in Redis per device session. */
interface StoredSession {
  refreshToken: string;
  userAgent: string;
  ip: string;
  lastActive: string;
  createdAt: string;
}

/** Returned to the frontend (no refreshToken exposed). */
export interface SessionInfo {
  deviceId: string;
  userAgent: string;
  ip: string;
  lastActive: string;
  createdAt: string;
  current: boolean;
}

const SESSION_PREFIX = "session:";
const REVOKED_PREFIX = "revoked:";
const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes — matches JWT expiry
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
const MAX_SESSIONS_PER_USER = 5;

export class AuthService {
  constructor(private userService: UserService) {}

  // ───────────── Session helpers ─────────────────────────────────────

  private sessionKey(userId: string, deviceId: string): string {
    return `${SESSION_PREFIX}${userId}:${deviceId}`;
  }

  private async storeSession(
    userId: string,
    deviceId: string,
    refreshToken: string,
    meta: { userAgent: string; ip: string },
  ): Promise<void> {
    const session: StoredSession = {
      refreshToken,
      userAgent: meta.userAgent,
      ip: meta.ip,
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await redisClient.set(
      this.sessionKey(userId, deviceId),
      JSON.stringify(session),
      "EX",
      REFRESH_TOKEN_TTL,
    );
  }

  private async getStoredSession(
    userId: string,
    deviceId: string,
  ): Promise<StoredSession | null> {
    const raw = await redisClient.get(this.sessionKey(userId, deviceId));
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  }

  private async removeSession(userId: string, deviceId: string): Promise<void> {
    await redisClient.del(this.sessionKey(userId, deviceId));
  }

  private async getUserSessionKeys(userId: string): Promise<string[]> {
    return redisClient.keys(`${SESSION_PREFIX}${userId}:*`);
  }

  private async enforceMaxSessions(userId: string): Promise<void> {
    const keys = await this.getUserSessionKeys(userId);
    if (keys.length < MAX_SESSIONS_PER_USER) return;

    const sessions = await Promise.all(
      keys.map(async (key) => {
        const raw = await redisClient.get(key);
        return { key, data: raw ? (JSON.parse(raw) as StoredSession) : null };
      }),
    );

    sessions.sort((a, b) => {
      if (!a.data) return -1;
      if (!b.data) return 1;
      return (
        new Date(a.data.lastActive).getTime() -
        new Date(b.data.lastActive).getTime()
      );
    });
    const toEvict = sessions.slice(
      0,
      sessions.length - MAX_SESSIONS_PER_USER + 1,
    );
    for (const s of toEvict) {
      const deviceId = s.key.split(":").pop()!;
      await this.removeSession(userId, deviceId);
      await this.revokeDevice(userId, deviceId);
    }
  }

  private async revokeDevice(userId: string, deviceId: string): Promise<void> {
    await redisClient.set(
      `${REVOKED_PREFIX}${userId}:${deviceId}`,
      "1",
      "EX",
      ACCESS_TOKEN_TTL,
    );
    await redisClient.publish(
      "device:revoked",
      JSON.stringify({ userId, deviceId }),
    );
  }

  async register(
    data: RegisterDTO,
    meta: { userAgent: string; ip: string },
  ): Promise<AuthResult> {
    const user = await this.userService.createUser({
      email: data.email,
      password: data.password,
      name: data.name,
    });

    const deviceId = randomUUID();
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      deviceId,
    };
    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await this.storeSession(user.id, deviceId, refreshToken, meta);

    return { user: toPublicUser(user), token, refreshToken, deviceId };
  }

  async login(
    data: LoginDTO,
    meta: { userAgent: string; ip: string },
  ): Promise<AuthResult> {
    const user = await this.userService.getUserByEmail(data.email);
    if (!user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not found");
    }
    const isPasswordValid = await user.comparePassword(data.password);
    if (!isPasswordValid) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Incorrect password");
    }

    await this.enforceMaxSessions(user.id);

    const deviceId = randomUUID();
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      deviceId,
    };
    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await this.storeSession(user.id, deviceId, refreshToken, meta);

    return { user: toPublicUser(user), token, refreshToken, deviceId };
  }

  async refresh(
    refreshToken: string,
    meta: { userAgent: string; ip: string },
  ): Promise<RefreshResult> {
    const { id, email, deviceId } = verifyRefreshToken(refreshToken);

    const stored = await this.getStoredSession(id, deviceId);
    if (!stored || stored.refreshToken !== refreshToken) {
      await this.removeSession(id, deviceId);
      await this.revokeDevice(id, deviceId);
      throw new AppError(StatusCodes.UNAUTHORIZED, "Refresh token revoked");
    }

    // 在每个循环都获取最新用户信息
    const user = await this.userService.getUserById(id);
    const payload = { id, email, name: user.name, deviceId };
    const newAccessToken = generateToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    await this.storeSession(id, deviceId, newRefreshToken, {
      userAgent: meta.userAgent || stored.userAgent,
      ip: meta.ip || stored.ip,
    });

    return { token: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string, deviceId: string): Promise<void> {
    await this.removeSession(userId, deviceId);
    await this.revokeDevice(userId, deviceId);
  }

  async getSessions(
    userId: string,
    currentDeviceId: string,
  ): Promise<SessionInfo[]> {
    const keys = await this.getUserSessionKeys(userId);
    const sessions: SessionInfo[] = [];
    for (const key of keys) {
      const raw = await redisClient.get(key);
      if (!raw) continue;
      const stored = JSON.parse(raw) as StoredSession;
      const deviceId = key.split(":").pop()!;
      sessions.push({
        deviceId,
        userAgent: stored.userAgent,
        ip: stored.ip,
        lastActive: stored.lastActive,
        createdAt: stored.createdAt,
        current: deviceId === currentDeviceId,
      });
    }

    sessions.sort(
      (a, b) =>
        new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime(),
    );
    return sessions;
  }

  async revokeSession(userId: string, targetDeviceId: string): Promise<void> {
    await this.removeSession(userId, targetDeviceId);
    await this.revokeDevice(userId, targetDeviceId);
  }
}
