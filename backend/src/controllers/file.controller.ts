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

  async createFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { folderId, key, size, mimeType, originalName, hash } = req.body;
    if (!key || !size || !mimeType || !originalName || !folderId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Missing required fields");
    }

    const exists = await StorageService.checkObjectExists(BUCKETS.FILES, key);
    if (!exists) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File not found in storage");
    }

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
      "File created successfully",
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
      "Download URL generated successfully",
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
      `inline; filename="${encodeURIComponent(result.fileName)}"`,
    );

    res.setHeader("Cache-Control", "private, max-age=3600");

    // 将 MinIO 流 pipe 到响应
    result.stream.pipe(res);
    result.stream.on("error", (error) => {
      console.error("Preview stream error:", error);
      if (!res.headersSent) {
        throw new AppError(
          StatusCodes.INTERNAL_SERVER_ERROR,
          "Failed to stream file",
        );
      }
    });
  }

  async getPreviewUrl(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const user = req.user;
    const result = await this.fileService.getPreviewUrl({
      userId: String(user._id),
      fileId: req.params.fileId,
      expirySeconds: 3600,
    });

    return ResponseHelper.success(
      res,
      {
        url: result.url,
        fileName: result.fileName,
        mimeType: result.mimeType,
        size: result.size,
        expiresIn: result.expiresIn,
      },
      StatusCodes.OK,
      "Preview URL generated successfully",
    );
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

  // 只创建空白文件
  async createBlankFile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { folderId, fileName, content } = req.body;
    if (!fileName) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File name is required");
    }

    const file = await this.fileService.createBlankFile({
      userId: req.user.id,
      folderId: folderId || "root",
      fileName,
      content: content || "",
    });

    return ResponseHelper.created<FileUploadResponse>(
      res,
      { file },
      "File created successfully",
    );
  }

  async getFileContent(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { fileId } = req.params;
    if (!fileId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File ID is required");
    }

    const result = await this.fileService.getFileContent({
      userId: req.user.id,
      fileId,
    });

    return ResponseHelper.success(res, result);
  }

  async updateFileContent(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { fileId } = req.params;
    const { content } = req.body;

    if (!fileId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File ID is required");
    }

    if (content === undefined || content === null) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Content is required");
    }

    const file = await this.fileService.updateFileContent({
      userId: req.user.id,
      fileId,
      content,
    });

    return ResponseHelper.success(
      res,
      { file },
      StatusCodes.OK,
      "File content updated",
    );
  }

  // 获取 OnlyOffice 配置：URL + token
  async getOfficeContentUrl(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { fileId } = req.params;
    if (!fileId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File ID is required");
    }

    const response = await this.fileService.getOnlyOfficeConfig({
      userId: req.user.id,
      userEmail: (req.user as IUser).email,
      fileId,
    });

    return ResponseHelper.success(res, response);
  }

  // 访问内容接口，返回文件流
  async serveOfficeContent(req: Request, res: Response, next: NextFunction) {
    const token = req.query.token as string;
    if (!token) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Token is required");
    }

    const payload = this.fileService.verifyOfficeContentToken(token);

    if (
      payload.purpose !== "office-content" ||
      payload.fileId !== req.params.fileId
    ) {
      throw new AppError(StatusCodes.FORBIDDEN, "Token mismatch");
    }

    const result = await this.fileService.getPreviewStream({
      userId: payload.id,
      fileId: payload.fileId,
    });

    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Length", result.size);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(result.fileName)}"`,
    );
    res.setHeader("Cache-Control", "private, max-age=900");

    result.stream.pipe(res);
    result.stream.on("error", (error) => {
      console.error("Office content stream error:", error);
      if (!res.headersSent) {
        throw new AppError(
          StatusCodes.INTERNAL_SERVER_ERROR,
          "Failed to stream file",
        );
      }
    });
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
        "Destination folder id is required",
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
