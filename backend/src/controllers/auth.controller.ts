import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { ResponseHelper } from "../utils/response.util";
import { AuthResponse } from "../types/response.types";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";

export class AuthController {
  constructor(private authService: AuthService) {}

  async register(req: Request, res: Response, next: NextFunction) {
    const { email, password, name } = req.body;
    const avatarDataUrl =
      typeof req.body.avatarDataUrl === "string"
        ? req.body.avatarDataUrl
        : undefined;
    const { user, token, refreshToken } = await this.authService.register({
      email: email,
      password: password,
      name: name,
      avatarDataUrl,
    });
    return ResponseHelper.created<AuthResponse>(
      res,
      { user, token, refreshToken },
      "Registration successful",
    );
  }

  async login(req: Request, res: Response, next: NextFunction) {
    const { email, password } = req.body;
    const { user, token, refreshToken } = await this.authService.login({
      email: email,
      password: password,
    });
    return ResponseHelper.ok<AuthResponse>(res, { user, token, refreshToken });
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Refresh token is required");
    }
    const result = await this.authService.refresh(refreshToken);
    return ResponseHelper.ok(res, result);
  }

  async logout(req: Request, res: Response) {
    if (req.user) {
      await this.authService.logout(req.user.id);
    }
    return ResponseHelper.message(res, "Successfully logged out");
  }
}
