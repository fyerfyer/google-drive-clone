import { StatusCodes } from "http-status-codes";
import { Request, Response, NextFunction } from "express";
import { AppError } from "../middlewares/errorHandler";
import { FolderService } from "../services/folder.service";
import { ResponseHelper } from "../utils/response.util";
import {
  FolderCreateResponse,
  FolderContentResponse,
} from "../types/response.types";

export class FolderController {
  constructor(private folderService: FolderService) {}

  async createFolder(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;

    const { name, parentId } = req.body;
    if (!name) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Folder name is required");
    }

    const folder = await this.folderService.createFolder({
      userId,
      name,
      parentId: parentId || null,
    });

    return ResponseHelper.created<FolderCreateResponse>(
      res,
      { folder },
      "Folder created successfully"
    );
  }

  async moveFolder(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { folderId } = req.params;
    const { destinationId } = req.body;
    await this.folderService.moveFolder({ folderId, destinationId, userId });
    return ResponseHelper.message(res, "Folder moved successfully");
  }

  async trashFolder(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { folderId } = req.params;
    if (!folderId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Folder not exist");
    }
    await this.folderService.trashFolder(folderId, userId);

    return ResponseHelper.message(res, "Folder moved to trash");
  }

  async renameFolder(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { folderId } = req.params;
    const { newName } = req.body;
    if (!folderId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Folder not exist");
    }

    if (!newName) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "New folder name is required"
      );
    }

    await this.folderService.renameFolder(folderId, newName, userId);
    return ResponseHelper.message(res, "Folder renamed successfully");
  }

  async restoreFolder(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { folderId } = req.params;
    if (!folderId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Folder not exist");
    }
    await this.folderService.restoreFolder(folderId, userId);

    return ResponseHelper.message(res, "Folder restored from trash");
  }

  async deleteFolderPermanent(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { folderId } = req.params;
    if (!folderId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Folder not exist");
    }
    await this.folderService.deleteFolderPermanent(folderId, userId);

    return ResponseHelper.message(res, "Folder permanently deleted");
  }

  async starFolder(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { folderId } = req.params;
    if (!folderId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Folder not exist");
    }
    await this.folderService.starFolder(folderId, userId, true);

    return ResponseHelper.message(res, "Folder starred");
  }

  async unstarFolder(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { folderId } = req.params;
    if (!folderId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Folder not exist");
    }
    await this.folderService.starFolder(folderId, userId, false);

    return ResponseHelper.message(res, "Folder unstarred");
  }

  async getFolderContent(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const folderId = req.params.folderId;

    const result = await this.folderService.getFolderContent(folderId, userId);

    return ResponseHelper.ok<FolderContentResponse>(res, result);
  }
}
