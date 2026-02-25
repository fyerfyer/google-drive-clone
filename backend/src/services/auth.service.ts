import { getReasonPhrase, StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import { generateToken } from "../utils/jwt.util";
import { UserService, IUserPublic, toPublicUser } from "./user.service";

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
}

export class AuthService {
  constructor(private userService: UserService) {}

  async register(data: RegisterDTO): Promise<AuthResponse> {
    const user = await this.userService.createUser({
      email: data.email,
      password: data.password,
      name: data.name,
    });

    const token = generateToken({ id: user.id, email: user.email });
    return {
      user: toPublicUser(user),
      token: token,
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

    const token = generateToken({ id: user.id, email: user.email });
    return {
      user: toPublicUser(user),
      token: token,
    };
  }
}
