import { PermissionService } from "../services/permission.service";
import { AccessRole, ResourceType } from "../types/model.types";
import { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler";
import { getReasonPhrase, StatusCodes } from "http-status-codes";

type RequireAccessOptions = {
  resourceType?: ResourceType;
  resourceIdGetter?: (req: Request) => string | undefined;
};

const isValidResourceType = (value?: string): value is ResourceType => {
  return value === "File" || value === "Folder";
};

export const requireAccess = (
  permissionService: PermissionService,
  requireRole: AccessRole,
  options: RequireAccessOptions = {},
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        getReasonPhrase(StatusCodes.UNAUTHORIZED),
      );
    }

    const resourceId =
      options.resourceIdGetter?.(req) ||
      (req.params.fileId as string | undefined) ||
      (req.params.folderId as string | undefined) ||
      (req.params.id as string | undefined);

    if (!resourceId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Resource ID is required");
    }

    const rawResourceType =
      options.resourceType ||
      (req.params.fileId ? "File" : undefined) ||
      (req.params.folderId ? "Folder" : undefined) ||
      (req.query.resourceType as string | undefined) ||
      (req.body.resourceType as string | undefined);

    if (!isValidResourceType(rawResourceType)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Valid resourceType is required (File or Folder)",
      );
    }

    // 特殊情况："root" 文件夹对已认证用户始终可访问
    // 这是前端的特殊设计
    if (resourceId === "root" && rawResourceType === "Folder") {
      return next();
    }

    const token = req.query.token as string;

    const hasAccess = await permissionService.checkPermission({
      userId: user.id,
      resourceId,
      resourceType: rawResourceType,
      requireRole,
      token,
    });

    if (!hasAccess) {
      throw new AppError(StatusCodes.FORBIDDEN, "Access Denied");
    }

    next();
  };
};
