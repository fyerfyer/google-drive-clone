import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { ResponseHelper } from "../utils/response.util";
import { AuthResponse } from "../types/response.types";

export class AuthController {
  constructor(private authService: AuthService) {}

  async register(req: Request, res: Response, next: NextFunction) {
    const { email, password, name } = req.body;
    const avatarDataUrl =
      typeof req.body.avatarDataUrl === "string"
        ? req.body.avatarDataUrl
        : undefined;
    const { user, token } = await this.authService.register({
      email: email,
      password: password,
      name: name,
      avatarDataUrl,
      avatarFile: req.file,
    });
    return ResponseHelper.created<AuthResponse>(
      res,
      { user, token },
      "Registration successful"
    );
  }

  async login(req: Request, res: Response, next: NextFunction) {
    const { email, password } = req.body;
    const { user, token } = await this.authService.login({
      email: email,
      password: password,
    });
    return ResponseHelper.ok<AuthResponse>(res, { user, token });
  }

  async logout(req: Request, res: Response) {
    return ResponseHelper.message(
      res,
      "Successfully logged out, please clear jwt token in client side"
    );
  }
}
