import { Request, Response, NextFunction } from "express";
import { AppError } from "../middlewares/errorHandler";
import { FileService } from "../services/file.service";
import { StatusCodes } from "http-status-codes";
import { IUser } from "../models/User.model";
import { ResponseHelper } from "../utils/response.util";
import { FileUploadResponse } from "../types/response.types";
import { StorageService } from "../services/storage.service";
import { BUCKETS } from "../config/s3";

export class FileController {
  constructor(private fileService: FileService) {}

  // async uploadFile(req: Request, res: Response, next: NextFunction) {
  //   if (!req.file) {
  //     throw new AppError(StatusCodes.BAD_REQUEST, "No file upload");
  //   }

  //   if (!req.user) {
  //     throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
  //   }

  //   const { folderId, hash } = req.body;
  //   const file = await this.fileService.uploadFile({
  //     userId: req.user.id,
  //     folderId,
  //     fileBuffer: req.file.buffer,
  //     fileSize: req.file.size,
  //     mimeType: req.file.mimetype,
  //     originalName: req.file.originalname,
  //     hash,
  //   });

  //   return ResponseHelper.created<FileUploadResponse>(
  //     res,
  //     { file },
  //     "File uploaded successfully"
  //   );
  // }

  async createFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { folderId, key, size, mimeType, originalName, hash } = req.body;
    if (!key || !size || !mimeType || !originalName || !folderId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Missing required fields");
    }

    // Verify object exists in storage
    const exists = await StorageService.checkObjectExists(BUCKETS.FILES, key);
    if (!exists) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File not found in storage");
    }

    // Create file record in database
    const file = await this.fileService.createFileRecord({
      userId: req.user.id,
      folderId,
      key,
      fileSize: size,
      mimeType,
      originalName,
      hash,
    });

    return ResponseHelper.created<FileUploadResponse>(
      res,
      { file },
      "File created successfully"
    );
  }

  async downloadFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const user = req.user as IUser;
    const result = await this.fileService.getPresignedDownloadUrl({
      userId: String(user._id),
      fileId: req.params.fileId,
      expirySeconds: 3600,
    });

    // 返回预签名 URL，让前端直接跳转或使用 window.open()
    return ResponseHelper.success(
      res,
      {
        downloadUrl: result.url,
        fileName: result.fileName,
        mimeType: result.mimeType,
        size: result.size,
        expiresIn: result.expiresIn,
      },
      StatusCodes.OK,
      "Download URL generated successfully"
    );
  }

  async previewFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const user = req.user as IUser;
    const result = await this.fileService.getPreviewStream({
      userId: String(user._id),
      fileId: req.params.fileId,
    });

    // 支持浏览器内预览
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Length", result.size);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(result.fileName)}"`
    );

    res.setHeader("Cache-Control", "private, max-age=3600");

    // 将 MinIO 流 pipe 到响应
    result.stream.pipe(res);
    result.stream.on("error", (error) => {
      console.error("Preview stream error:", error);
      if (!res.headersSent) {
        throw new AppError(
          StatusCodes.INTERNAL_SERVER_ERROR,
          "Failed to stream file"
        );
      }
    });
  }

  async renameFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { fileId } = req.params;
    const { newName } = req.body;

    if (!fileId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File not exist");
    }

    if (!newName) {
      throw new AppError(StatusCodes.BAD_REQUEST, "New file name is required");
    }

    await this.fileService.renameFile(fileId, userId, newName);
    return ResponseHelper.message(res, "File renamed successfully");
  }

  async moveFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { fileId } = req.params;
    const { destinationId } = req.body;
    if (!fileId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File not exist");
    }

    if (!destinationId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Destination folder id is required"
      );
    }
    await this.fileService.moveFile(fileId, userId, destinationId);
    return ResponseHelper.message(res, "File moved successfully");
  }

  async trashFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { fileId } = req.params;
    if (!fileId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File not exist");
    }
    await this.fileService.trashFile(fileId, userId);

    return ResponseHelper.message(res, "File moved to trash");
  }

  async restoreFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { fileId } = req.params;
    if (!fileId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File not exist");
    }
    await this.fileService.restoreFile(fileId, userId);

    return ResponseHelper.message(res, "File restored from trash");
  }

  async deleteFilePermanent(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { fileId } = req.params;
    if (!fileId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File not exist");
    }
    await this.fileService.deleteFilePermanent(fileId, userId);

    return ResponseHelper.message(res, "File permanently deleted");
  }

  async starFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { fileId } = req.params;
    if (!fileId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File not exist");
    }
    await this.fileService.starFile(fileId, userId, true);

    return ResponseHelper.message(res, "File starred successfully");
  }

  async unstarFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { fileId } = req.params;
    if (!fileId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File not exist");
    }
    await this.fileService.starFile(fileId, userId, false);

    return ResponseHelper.message(res, "File unstarred successfully");
  }

  async getStarredFiles(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const files = await this.fileService.getStarredFiles(userId);
    return ResponseHelper.ok(res, files);
  }

  async getTrashedFiles(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const files = await this.fileService.getTrashedFiles(userId);
    return ResponseHelper.ok(res, files);
  }

  async getRecentFiles(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const files = await this.fileService.getRecentFiles(userId, limit);
    return ResponseHelper.ok(res, files);
  }

  async getAllUserFiles(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const files = await this.fileService.getAllUserFiles(userId);
    return ResponseHelper.ok(res, files);
  }
}
