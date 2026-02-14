import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { ShareService } from "../services/share.service";

import { ResourceType } from "../types/model.types";
import { ResponseHelper } from "../utils/response.util";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../lib/logger";

import {
  ShareResourceResponse,
  ResourcePermissionsResponse,
  RemovePermissionResponse,
  ChangePermissionResponse,
  SharedWithMeResponse,
  PaginationMeta,
} from "../types/response.types";
import { BUCKETS } from "../config/s3";
import { StorageService } from "../services/storage.service";

export class ShareController {
  constructor(private shareService: ShareService) {}

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

    const result = await this.shareService.shareWithUsers({
      actorId: userId,
      resourceId,
      resourceType: normalizedResourceType,
      targetUserIds,
      role,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      notifyUsers: true,
      resourceName,
    });

    return ResponseHelper.ok<ShareResourceResponse>(res, {
      message: `Resource shared with ${result.successCount} user(s)`,
    });
  }

  async getResourcePermissions(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { resourceId } = req.params;
    const resourceType = this.normalizeResourceType(req.query.resourceType);

    const permissions = await this.shareService.getResourcePermissions(
      req.user.id,
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

    await this.shareService.unshareWithUser({
      actorId: userId,
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

    await this.shareService.updateUserShareRole({
      actorId: userId,
      resourceId,
      resourceType: normalizedResourceType,
      targetUserId,
      newRole,
    });

    return ResponseHelper.ok<ChangePermissionResponse>(res, {
      message: "Permission updated successfully",
    });
  }

  async createShareLink(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { resourceId } = req.params;
    const { resourceType, options } = req.body;

    const normalizedResourceType = this.normalizeResourceType(resourceType);

    const shareLink = await this.shareService.createShareLink({
      actorId: req.user.id,
      resourceId,
      resourceType: normalizedResourceType,
      options,
    });

    return ResponseHelper.created(res, {
      shareLink: {
        id: shareLink._id.toString(),
        token: shareLink.token,
        role: shareLink.policy.role,
        requireLogin: shareLink.policy.requireLogin,
        allowDownload: shareLink.policy.allowDownload,
        expiresAt: shareLink.policy.expiresAt,
        maxAccessCount: shareLink.policy.maxAccessCount,
        createdAt: shareLink.createdAt,
      },
    });
  }

  async listShareLinks(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { resourceId } = req.params;
    const resourceType = this.normalizeResourceType(req.query.resourceType);

    const links = await this.shareService.listShareLinks(
      req.user.id,
      resourceId,
      resourceType,
    );

    return ResponseHelper.ok(res, { shareLinks: links });
  }

  async updateShareLink(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { linkId } = req.params;
    const { options } = req.body;

    const updatedLink = await this.shareService.updateShareLink({
      actorId: req.user.id,
      linkId,
      options,
    });

    return ResponseHelper.ok(res, {
      shareLink: {
        id: updatedLink._id.toString(),
        token: updatedLink.token,
        role: updatedLink.policy.role,
        requireLogin: updatedLink.policy.requireLogin,
        allowDownload: updatedLink.policy.allowDownload,
        expiresAt: updatedLink.policy.expiresAt,
        maxAccessCount: updatedLink.policy.maxAccessCount,
      },
    });
  }

  async revokeShareLink(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { linkId } = req.params;

    await this.shareService.revokeShareLink({
      actorId: req.user.id,
      linkId,
    });

    return ResponseHelper.ok(res, {
      message: "Share link revoked successfully",
    });
  }

  async rotateShareLinkToken(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { linkId } = req.params;

    const updatedLink = await this.shareService.rotateShareLinkToken(
      req.user.id,
      linkId,
    );

    return ResponseHelper.ok(res, {
      shareLink: {
        id: updatedLink._id.toString(),
        token: updatedLink.token,
      },
    });
  }

  async listSharedWithMe(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const userId = req.user.id;
    const { page = "1", limit = "20", resourceType } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const result = await this.shareService.listSharedWithMe({
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
    const { password } = req.query;

    const normalizedResourceType = this.normalizeResourceType(resourceType);

    const result = await this.shareService.getResourceByShareToken(
      token,
      normalizedResourceType,
      password as string | undefined,
    );

    return ResponseHelper.ok(res, result);
  }

  async downloadSharedFile(req: Request, res: Response) {
    const { token } = req.params;
    const { password } = req.query;

    const file = await this.shareService.getSharedFileForDownload(
      token,
      password as string,
    );

    if (!file.allowDownload) {
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
      file.originalName,
    );

    logger.info(
      { token, fileId: file.fileId },
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
    const { password } = req.query;

    const file = await this.shareService.getSharedFileForDownload(
      token,
      password as string,
    );

    // 避免代理过大文件（50MB 限制）
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
    const { password } = req.query;

    const file = await this.shareService.getSharedFileForDownload(
      token,
      password as string,
    );

    const presignedUrl = await StorageService.getDownloadUrl(
      BUCKETS.FILES,
      file.key,
      3600,
      "inline",
      file.originalName,
    );

    logger.info(
      { token, fileId: file.fileId },
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
    const { subfolderId, password } = req.query;

    const content = await this.shareService.getSharedFolderContent(
      token,
      subfolderId as string | undefined,
      password as string | undefined,
    );

    return ResponseHelper.ok(res, content);
  }

  async getSharedFolderPath(req: Request, res: Response) {
    const { token, folderId } = req.params;
    const { password } = req.query;

    const path = await this.shareService.getSharedFolderPath(
      token,
      folderId,
      password as string | undefined,
    );

    return ResponseHelper.ok(res, path);
  }

  async saveSharedResource(req: Request, res: Response) {
    if (!req.user) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "Login required to save shared resource",
      );
    }

    const { token, resourceType } = req.params;
    const { targetFolderId, password } = req.body;

    const normalizedResourceType = this.normalizeResourceType(resourceType);

    // 首先获取资源信息（包含密码验证）
    const resourceInfo = await this.shareService.getResourceByShareToken(
      token,
      normalizedResourceType,
      password,
    );

    const result = await this.shareService.saveSharedResource({
      userId: req.user.id,
      resourceId: resourceInfo.resourceId,
      resourceType: normalizedResourceType,
      targetFolderId: targetFolderId || "root",
      shareLinkToken: token,
      shareLinkPassword: password,
    });

    return ResponseHelper.created(res, {
      message: "Resource saved successfully",
      shortcut: result,
    });
  }
}
