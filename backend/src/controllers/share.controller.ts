import { Request, Response } from "express";
import { PermissionService } from "../services/permission.service";
import { ResourceType } from "../types/model.types";
import { StatusCodes } from "http-status-codes";
import { ResponseHelper } from "../utils/response.util";
import {
  ShareResourceResponse,
  ResourcePermissionsResponse,
  RemovePermissionResponse,
  ChangePermissionResponse,
  UpdateLinkShareResponse,
  SharedWithMeResponse,
  PaginationMeta,
} from "../types/response.types";
import { AppError } from "../middlewares/errorHandler";
import File from "../models/File.model";
import Folder from "../models/Folder.model";
import { StorageService } from "../services/storage.service";
import { BUCKETS } from "../config/s3";
import { logger } from "../lib/logger";

export class ShareController {
  private permissionService: PermissionService;

  private normalizeResourceType(raw: unknown): ResourceType {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === "File" || value === "Folder") {
      return value;
    }
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Valid resourceType is required (File or Folder)",
    );
  }

  private normalizeOptionalResourceType(
    raw: unknown,
  ): ResourceType | undefined {
    if (raw === undefined || raw === null) {
      return undefined;
    }
    return this.normalizeResourceType(raw);
  }

  constructor(permissionService: PermissionService) {
    this.permissionService = permissionService;
  }

  async shareResource(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }
    const userId = req.user.id;
    const {
      resourceId,
      resourceType,
      resourceName,
      targetUserIds,
      role,
      expiresAt,
    } = req.body;

    const normalizedResourceType = this.normalizeResourceType(resourceType);

    await this.permissionService.shareResource({
      requesterId: userId,
      resourceId,
      resourceType: normalizedResourceType,
      resourceName,
      targetUserIds,
      role,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    return ResponseHelper.ok<ShareResourceResponse>(res, {
      message: "Resource shared successfully",
    });
  }

  async getResourcePermissions(req: Request, res: Response) {
    const { resourceId } = req.params;
    const resourceType = this.normalizeResourceType(req.query.resourceType);

    const permissions = await this.permissionService.getResourcePermissions(
      resourceId,
      resourceType,
    );

    return ResponseHelper.ok<ResourcePermissionsResponse>(res, permissions);
  }

  async removePermission(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { resourceId, targetUserId } = req.params;
    const resourceType = this.normalizeResourceType(req.query.resourceType);

    await this.permissionService.removePermission({
      requesterId: userId,
      resourceId,
      resourceType,
      targetUserId,
    });

    return ResponseHelper.ok<RemovePermissionResponse>(res, {
      message: "Permission removed successfully",
    });
  }

  async changePermission(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }
    const userId = req.user.id;
    const { resourceId, targetUserId } = req.params;
    const { resourceType, newRole } = req.body;

    const normalizedResourceType = this.normalizeResourceType(resourceType);

    await this.permissionService.changePermission({
      requesterId: userId,
      resourceId,
      resourceType: normalizedResourceType,
      targetUserId,
      newRole,
    });

    return ResponseHelper.ok<ChangePermissionResponse>(res, {
      message: "Permission updated successfully",
    });
  }

  async updateLinkShare(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { resourceId } = req.params;
    const { resourceType, linkShareConfig } = req.body;

    const normalizedResourceType = this.normalizeResourceType(resourceType);

    const result = await this.permissionService.updateLinkShare({
      userId,
      resourceId,
      resourceType: normalizedResourceType,
      linkShareConfig,
    });

    return ResponseHelper.ok<UpdateLinkShareResponse>(res, result);
  }

  async listSharedWithMe(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }
    const userId = req.user.id;
    const { page = "1", limit = "20", resourceType } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const result = await this.permissionService.listSharedWithMe({
      userId,
      page: pageNum,
      limit: limitNum,
      resourceType: this.normalizeOptionalResourceType(resourceType),
    });

    const pagination: PaginationMeta = {
      page: pageNum,
      limit: limitNum,
      total: result.total,
      totalPages: Math.ceil(result.total / limitNum),
    };

    return ResponseHelper.ok<
      SharedWithMeResponse & { pagination: PaginationMeta }
    >(res, {
      ...result,
      pagination,
    });
  }

  async getSharedByToken(req: Request, res: Response) {
    const { token, resourceType } = req.params;

    const normalizedResourceType = this.normalizeResourceType(resourceType);

    const result = await this.permissionService.getResourceByShareToken(
      token,
      normalizedResourceType,
    );

    return ResponseHelper.ok(res, result);
  }

  // Helper method to validate share token and get file
  private async validateShareTokenAndGetFile(token: string) {
    const file = await File.findOne({ "linkShare.token": token })
      .select("+key name linkShare mimeType size originalName")
      .lean();

    if (!file) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        "Shared file not found or link has expired",
      );
    }

    const linkShare = file.linkShare;
    if (!linkShare || !linkShare.enableLinkSharing) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Link sharing is disabled for this file",
      );
    }

    if (linkShare.expiresAt && new Date() > linkShare.expiresAt) {
      throw new AppError(StatusCodes.FORBIDDEN, "This share link has expired");
    }

    if (linkShare.scope === "none") {
      throw new AppError(StatusCodes.FORBIDDEN, "Link sharing is restricted");
    }

    return file;
  }

  // Helper method to validate share token and get folder
  private async validateShareTokenAndGetFolder(token: string) {
    const folder = await Folder.findOne({ "linkShare.token": token })
      .select("name linkShare user ancestors")
      .lean();

    if (!folder) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        "Shared folder not found or link has expired",
      );
    }

    const linkShare = folder.linkShare;
    if (!linkShare || !linkShare.enableLinkSharing) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Link sharing is disabled for this folder",
      );
    }

    if (linkShare.expiresAt && new Date() > linkShare.expiresAt) {
      throw new AppError(StatusCodes.FORBIDDEN, "This share link has expired");
    }

    if (linkShare.scope === "none") {
      throw new AppError(StatusCodes.FORBIDDEN, "Link sharing is restricted");
    }

    return folder;
  }

  async downloadSharedFile(req: Request, res: Response) {
    const { token } = req.params;
    const file = await this.validateShareTokenAndGetFile(token);

    // Check if download is allowed
    if (!file.linkShare?.allowDownload) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Download is not allowed for this shared file",
      );
    }

    const presignedUrl = await StorageService.getDownloadUrl(
      BUCKETS.FILES,
      file.key,
      3600,
      "attachment",
    );

    logger.info(
      { token, fileId: file._id },
      "Generated shared file download URL",
    );

    return ResponseHelper.ok(res, {
      downloadUrl: presignedUrl,
      fileName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      expiresIn: 3600,
    });
  }

  async previewSharedFile(req: Request, res: Response) {
    const { token } = req.params;
    const file = await this.validateShareTokenAndGetFile(token);

    // Avoid proxying very large files (50MB limit)
    const MAX_PREVIEW_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_PREVIEW_SIZE) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "File too large for preview. Please use download instead.",
      );
    }

    const stream = await StorageService.getObjectStream(
      BUCKETS.FILES,
      file.key,
    );

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", file.size);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(file.originalName)}"`,
    );
    res.setHeader("Cache-Control", "private, max-age=3600");

    stream.pipe(res);
    stream.on("error", (error) => {
      logger.error({ error, token }, "Preview stream error for shared file");
      if (!res.headersSent) {
        throw new AppError(
          StatusCodes.INTERNAL_SERVER_ERROR,
          "Failed to stream file",
        );
      }
    });
  }

  async getSharedFilePreviewUrl(req: Request, res: Response) {
    const { token } = req.params;
    const file = await this.validateShareTokenAndGetFile(token);

    const presignedUrl = await StorageService.getDownloadUrl(
      BUCKETS.FILES,
      file.key,
      3600,
      "inline",
    );

    logger.info(
      { token, fileId: file._id },
      "Generated shared file preview URL",
    );

    return ResponseHelper.ok(res, {
      url: presignedUrl,
      fileName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      expiresIn: 3600,
    });
  }

  async getSharedFolderContent(req: Request, res: Response) {
    const { token } = req.params;
    const { subfolderId } = req.query;
    const folder = await this.validateShareTokenAndGetFolder(token);

    // Determine which folder to list - the shared folder or a subfolder
    let targetFolderId = folder._id;

    if (subfolderId && subfolderId !== "root") {
      // Verify the subfolder is within the shared folder hierarchy
      const subfolderDoc = await Folder.findById(subfolderId)
        .select("ancestors")
        .lean();

      if (!subfolderDoc) {
        throw new AppError(StatusCodes.NOT_FOUND, "Subfolder not found");
      }

      // Check if shared folder is in the subfolder's ancestors
      const isInSharedFolder = subfolderDoc.ancestors.some(
        (ancestorId) => ancestorId.toString() === folder._id.toString(),
      );

      if (!isInSharedFolder && subfolderId !== folder._id.toString()) {
        throw new AppError(
          StatusCodes.FORBIDDEN,
          "Access denied to this subfolder",
        );
      }

      targetFolderId = subfolderDoc._id;
    }

    // Fetch folder content
    const [currentFolder, folders, files] = await Promise.all([
      Folder.findById(targetFolderId).select("name color").lean(),
      Folder.find({
        folder: targetFolderId,
        isTrashed: false,
      })
        .select("name color updatedAt")
        .lean(),
      File.find({
        folder: targetFolderId,
        isTrashed: false,
      })
        .select("name mimeType size extension originalName updatedAt")
        .lean(),
    ]);

    return ResponseHelper.ok(res, {
      currentFolder: currentFolder
        ? {
            id: currentFolder._id.toString(),
            name: currentFolder.name,
            color: currentFolder.color,
          }
        : null,
      folders: folders.map((f) => ({
        id: f._id.toString(),
        name: f.name,
        color: f.color,
        type: "folder",
        updatedAt: f.updatedAt,
      })),
      files: files.map((f) => ({
        id: f._id.toString(),
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        extension: f.extension,
        originalName: f.originalName,
        type: "file",
        updatedAt: f.updatedAt,
      })),
      shareToken: token,
    });
  }

  async getSharedFolderPath(req: Request, res: Response) {
    const { token, folderId } = req.params;
    const sharedFolder = await this.validateShareTokenAndGetFolder(token);

    // If requesting path for the shared folder itself
    if (folderId === sharedFolder._id.toString()) {
      return ResponseHelper.ok(res, [
        {
          id: sharedFolder._id.toString(),
          name: sharedFolder.name,
        },
      ]);
    }

    // Get the target folder
    const targetFolder = await Folder.findById(folderId)
      .select("name ancestors")
      .lean();

    if (!targetFolder) {
      throw new AppError(StatusCodes.NOT_FOUND, "Folder not found");
    }

    // Verify target is within shared folder
    const isInSharedFolder = targetFolder.ancestors.some(
      (ancestorId) => ancestorId.toString() === sharedFolder._id.toString(),
    );

    if (!isInSharedFolder) {
      throw new AppError(StatusCodes.FORBIDDEN, "Access denied to this folder");
    }

    // Build path starting from shared folder
    const sharedFolderIndex = targetFolder.ancestors.findIndex(
      (id) => id.toString() === sharedFolder._id.toString(),
    );

    const relevantAncestors = targetFolder.ancestors.slice(sharedFolderIndex);
    const ancestorFolders = await Folder.find({
      _id: { $in: relevantAncestors },
    })
      .select("name")
      .lean();

    const ancestorMap = new Map(
      ancestorFolders.map((f) => [f._id.toString(), f.name]),
    );

    const path = [
      ...relevantAncestors.map((id) => ({
        id: id.toString(),
        name: ancestorMap.get(id.toString()) || "Unknown",
      })),
      {
        id: targetFolder._id.toString(),
        name: targetFolder.name,
      },
    ];

    return ResponseHelper.ok(res, path);
  }
}
