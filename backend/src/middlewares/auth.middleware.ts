import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { getReasonPhrase, StatusCodes } from "http-status-codes";
import { verifyToken } from "../utils/jwt.util";
import User from "../models/User.model";

export const jwtAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      getReasonPhrase(StatusCodes.UNAUTHORIZED)
    );
  }

  const { id, email } = verifyToken(token);
  const currentUser = await User.findOne({ _id: id, email: email });
  if (!currentUser) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      getReasonPhrase(StatusCodes.UNAUTHORIZED)
    );
  }

  req.user = currentUser;
  next();
};
