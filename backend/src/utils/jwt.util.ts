import jwt from "jsonwebtoken";
import { config } from "../config/env";

interface JwtPayload {
  id: string;
  email: string;
}

export const generateToken = (payload: JwtPayload): string => {
  const secret: string = config.jwtSecret;
  return jwt.sign(payload, secret, { 
    expiresIn: config.jwtExpire 
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    const secret: string = config.jwtSecret;
    const decode = jwt.verify(token, secret);
    return decode as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Token expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid token");
    }
    throw new Error("Failed to verify token");
  }
};
