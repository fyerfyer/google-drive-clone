import { StatusCodes } from "http-status-codes";
import { Request, Response, NextFunction } from "express";
import { AppError } from "../middlewares/errorHandler";
import { FolderService } from "../services/folder.service";

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

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: folder,
    });
  }

  async moveFolder(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { folderId, destinationId } = req.body;
    await this.folderService.moveFolder({ folderId, destinationId, userId });
    res.status(StatusCodes.OK).json({
      success: true,
    });
  }

  async trashFolder(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { folderId } = req.body;
    if (!folderId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Folder not exist");
    }
    await this.folderService.trashFolder(folderId, userId);

    res.status(StatusCodes.OK).json({
      success: true,
    });
  }

  async getFolderContent(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const folderId = req.params.folderId;

    const { folders, files } = await this.folderService.getFolderContent(
      folderId,
      userId
    );

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        folders,
        files,
      },
    });
  }
}
