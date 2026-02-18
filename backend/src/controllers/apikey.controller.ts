import { Request, Response, NextFunction } from "express";
import { ApiKeyService } from "../services/apikey.service";
import { ResponseHelper } from "../utils/response.util";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { extractParam } from "../utils/request.util";

export class ApiKeyController {
  constructor(private apiKeyService: ApiKeyService) {}

  async createApiKey(req: Request, res: Response, _next: NextFunction) {
    const userId = req.user!.id;
    const { name, expiresAt } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      throw new AppError(StatusCodes.BAD_REQUEST, "API key name is required");
    }

    if (name.trim().length > 100) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "API key name must be 100 characters or less",
      );
    }

    const expires = expiresAt ? new Date(expiresAt) : undefined;
    if (expires && isNaN(expires.getTime())) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Invalid expiration date");
    }

    const result = await this.apiKeyService.createApiKey(
      userId,
      name.trim(),
      expires,
    );

    return ResponseHelper.created(
      res,
      {
        apiKey: result.apiKey,
        rawKey: result.rawKey,
      },
      "API key created. Save the key now — it won't be shown again.",
    );
  }

  async listApiKeys(req: Request, res: Response, _next: NextFunction) {
    const userId = req.user!.id;
    const apiKeys = await this.apiKeyService.listApiKeys(userId);
    return ResponseHelper.ok(res, { apiKeys });
  }

  async revokeApiKey(req: Request, res: Response, _next: NextFunction) {
    const userId = req.user!.id;
    const keyId = extractParam(req.params.keyId);

    if (!keyId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Key ID is required");
    }

    await this.apiKeyService.revokeApiKey(keyId, userId);
    return ResponseHelper.message(res, "API key revoked");
  }

  async deleteApiKey(req: Request, res: Response, _next: NextFunction) {
    const userId = req.user!.id;
    const keyId = extractParam(req.params.keyId);

    if (!keyId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Key ID is required");
    }

    await this.apiKeyService.deleteApiKey(keyId, userId);
    return ResponseHelper.noContent(res);
  }
}
