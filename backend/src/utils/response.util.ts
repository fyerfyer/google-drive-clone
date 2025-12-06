import { Response } from "express";
import { ApiResponse } from "../types/response.types";
import { StatusCodes } from "http-status-codes";

export class ResponseHelper {
  static success<T>(
    res: Response,
    data: T,
    statusCode: number = StatusCodes.OK,
    message?: string
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      ...(message && { message }),
    };
    return res.status(statusCode).json(response);
  }

  static created<T>(res: Response, data: T, message?: string): Response {
    return this.success(res, data, StatusCodes.CREATED, message);
  }

  static message(
    res: Response,
    message: string,
    statusCode: number = StatusCodes.OK
  ): Response {
    const response: ApiResponse = {
      success: true,
      message,
    };
    return res.status(statusCode).json(response);
  }

  static noContent(res: Response): Response {
    return res.status(StatusCodes.NO_CONTENT).send();
  }

  static ok<T>(res: Response, data: T): Response {
    return this.success(res, data, StatusCodes.OK);
  }
}
