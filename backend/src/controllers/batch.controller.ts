import { Request, Response, NextFunction } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../middlewares/errorHandler";
import {
  BatchService,
  type BatchItemRequest,
  type BatchOperationResponse,
} from "../services/batch.service";
import { ResponseHelper } from "../utils/response.util";

export class BatchController {
  constructor(private batchService: BatchService) {}

  async batchTrash(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { items } = req.body as { items: BatchItemRequest[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Items array is required and must not be empty"
      );
    }

    // 验证每个item的格式
    for (const item of items) {
      if (!item.id || !item.type) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Each item must have id and type"
        );
      }
      if (item.type !== "file" && item.type !== "folder") {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Item type must be either 'file' or 'folder'"
        );
      }
    }

    const result = await this.batchService.batchTrash(req.user.id, items);

    return ResponseHelper.success<BatchOperationResponse>(
      res,
      result,
      StatusCodes.OK,
      `Batch trash completed: ${result.successCount} succeeded, ${result.failureCount} failed`
    );
  }

  async batchRestore(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { items } = req.body as { items: BatchItemRequest[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Items array is required and must not be empty"
      );
    }

    for (const item of items) {
      if (!item.id || !item.type) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Each item must have id and type"
        );
      }
      if (item.type !== "file" && item.type !== "folder") {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Item type must be either 'file' or 'folder'"
        );
      }
    }

    const result = await this.batchService.batchRestore(req.user.id, items);

    return ResponseHelper.success<BatchOperationResponse>(
      res,
      result,
      StatusCodes.OK,
      `Batch restore completed: ${result.successCount} succeeded, ${result.failureCount} failed`
    );
  }

  async batchDelete(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { items } = req.body as { items: BatchItemRequest[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Items array is required and must not be empty"
      );
    }

    for (const item of items) {
      if (!item.id || !item.type) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Each item must have id and type"
        );
      }
      if (item.type !== "file" && item.type !== "folder") {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Item type must be either 'file' or 'folder'"
        );
      }
    }

    const result = await this.batchService.batchDeletePermanent(
      req.user.id,
      items
    );

    return ResponseHelper.success<BatchOperationResponse>(
      res,
      result,
      StatusCodes.OK,
      `Batch delete completed: ${result.successCount} succeeded, ${result.failureCount} failed`
    );
  }

  async batchMove(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { items, destinationId } = req.body as {
      items: BatchItemRequest[];
      destinationId: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Items array is required and must not be empty"
      );
    }

    if (!destinationId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Destination folder ID is required"
      );
    }

    for (const item of items) {
      if (!item.id || !item.type) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Each item must have id and type"
        );
      }
      if (item.type !== "file" && item.type !== "folder") {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Item type must be either 'file' or 'folder'"
        );
      }
    }

    const result = await this.batchService.batchMove(
      req.user.id,
      items,
      destinationId
    );

    return ResponseHelper.success<BatchOperationResponse>(
      res,
      result,
      StatusCodes.OK,
      `Batch move completed: ${result.successCount} succeeded, ${result.failureCount} failed`
    );
  }

  async batchStar(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "User not authenticated");
    }

    const { items, star } = req.body as {
      items: BatchItemRequest[];
      star: boolean;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Items array is required and must not be empty"
      );
    }

    if (typeof star !== "boolean") {
      throw new AppError(StatusCodes.BAD_REQUEST, "Star must be a boolean");
    }

    for (const item of items) {
      if (!item.id || !item.type) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Each item must have id and type"
        );
      }
      if (item.type !== "file" && item.type !== "folder") {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "Item type must be either 'file' or 'folder'"
        );
      }
    }

    const result = await this.batchService.batchStar(req.user.id, items, star);

    return ResponseHelper.success<BatchOperationResponse>(
      res,
      result,
      StatusCodes.OK,
      `Batch ${star ? "star" : "unstar"} completed: ${result.successCount} succeeded, ${result.failureCount} failed`
    );
  }
}
