import { PermissionService } from "../services/permission.service";
import { AccessRole } from "../types/model.types";
import { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler";
import { getReasonPhrase, StatusCodes } from "http-status-codes";

export const requireAccess = (
  permissionService: PermissionService,
  requireRole: AccessRole
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        getReasonPhrase(StatusCodes.UNAUTHORIZED)
      );
    }

    // 让 file folder router 把 resourceId 放到 params 里
    const resourceId = req.params.id;
    const { resourceType } = req.body;

    // TODO：token来源？
    const token = req.query.token as string;
    const hasAccess = await permissionService.checkPermission({
      userId: user.id,
      resourceId,
      resourceType,
      requireRole,
      token,
    });

    if (!hasAccess) {
      throw new AppError(StatusCodes.FORBIDDEN, "Access Denied");
    }
    next();
  };
};
