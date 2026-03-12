import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { ResponseHelper } from "../utils/response.util";
import { AuthResponse } from "../types/response.types";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { config } from "../config/env";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.nodeEnv === "production",
  sameSite: "lax" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days 
  path: "/",
};

export class AuthController {
  constructor(private authService: AuthService) {}

  async register(req: Request, res: Response, next: NextFunction) {
    const { email, password, name } = req.body;
    const avatarDataUrl =
      typeof req.body.avatarDataUrl === "string"
        ? req.body.avatarDataUrl
        : undefined;

    const meta = {
      userAgent: req.headers["user-agent"] || "unknown",
      ip: req.ip || "unknown",
    };

    const result = await this.authService.register(
      { email, password, name, avatarDataUrl },
      meta,
    );

    // 在 Cookies 中设置 refresh token
    res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);

    return ResponseHelper.created<AuthResponse>(
      res,
      { user: result.user, token: result.token, deviceId: result.deviceId },
      "Registration successful",
    );
  }

  async login(req: Request, res: Response, next: NextFunction) {
    const { email, password } = req.body;

    const meta = {
      userAgent: req.headers["user-agent"] || "unknown",
      ip: req.ip || "unknown",
    };

    const result = await this.authService.login({ email, password }, meta);

    res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);

    return ResponseHelper.ok<AuthResponse>(res, {
      user: result.user,
      token: result.token,
      deviceId: result.deviceId,
    });
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    // 从 cookie 中读取 refresh token
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Refresh token is required");
    }

    const meta = {
      userAgent: req.headers["user-agent"] || "unknown",
      ip: req.ip || "unknown",
    };

    const result = await this.authService.refresh(refreshToken, meta);

    res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);

    return ResponseHelper.ok(res, { token: result.token });
  }

  async logout(req: Request, res: Response) {
    if (req.user) {
      await this.authService.logout(req.user.id, req.user.deviceId);
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "lax" as const,
      path: "/",
    });
    return ResponseHelper.message(res, "Successfully logged out");
  }

  async getSessions(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Not authenticated");
    }
    const sessions = await this.authService.getSessions(
      req.user.id,
      req.user.deviceId,
    );
    return ResponseHelper.ok(res, { sessions });
  }

  async revokeSession(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Not authenticated");
    }
    const { deviceId } = req.params;
    if (!deviceId || typeof deviceId !== "string") {
      throw new AppError(StatusCodes.BAD_REQUEST, "Device ID is required");
    }
    if (deviceId === req.user.deviceId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Cannot revoke current session — use logout instead",
      );
    }
    await this.authService.revokeSession(req.user.id, deviceId);
    return ResponseHelper.message(res, "Session revoked");
  }
}
