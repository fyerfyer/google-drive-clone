import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { AuthService } from "../services/auth.service";
import { UserService, IUserPublic } from "../services/user.service";

export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService
  ) {}

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
