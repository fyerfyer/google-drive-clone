import { Request, Response, NextFunction } from "express";
import { AppError } from "../middlewares/errorHandler";
import { FileService } from "../services/file.service";
import { StatusCodes } from "http-status-codes";
import User, { IUser } from "../models/User.model";

export class FileController {
  constructor(private fileService: FileService) {}

  async uploadFile(req: Request, res: Response, next: NextFunction) {
    if (!req.file) {
      throw new AppError(StatusCodes.BAD_REQUEST, "No file upload");
    }

    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { folderId, hash } = req.body;
    const file = await this.fileService.uploadFile({
      userId: req.user.id,
      folderId,
      fileBuffer: req.file.buffer,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      hash,
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: file,
    });
  }

  async downloadFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const user = req.user as IUser;
    const result = await this.fileService.getDownloadLink({
      userId: String(user._id),
      fileId: req.params.fileId,
    });

    res.setHeader("Content-Type", result.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(result.fileName)}"`
    );
    result.stream.pipe(res);
  }
}
