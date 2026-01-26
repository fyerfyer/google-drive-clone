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
}
