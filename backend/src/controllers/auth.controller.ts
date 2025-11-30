import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { AuthService } from "../services/auth.service";

export class AuthController {
  constructor(private authService: AuthService) {}

  async register(req: Request, res: Response, next: NextFunction) {
    try {
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
      res.status(StatusCodes.CREATED).json({
        success: true,
        message: "Registration successful",
        data: { user, token },
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const { user, token } = await this.authService.login({
        email: email,
        password: password,
      });
      res.status(StatusCodes.OK).json({
        success: true,
        message: "Login successful",
        data: { user, token },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response) {
    res.status(StatusCodes.OK).json({
      success: true,
      message: "Successfully logout, please clear jwt token in client side",
    });
  }
}
