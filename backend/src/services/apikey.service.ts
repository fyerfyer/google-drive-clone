import ApiKey, {
  IApiKey,
  generateApiKey,
  hashApiKey,
} from "../models/ApiKey.model";
import User from "../models/User.model";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { logger } from "../lib/logger";

export interface ApiKeyPublic {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface CreateApiKeyResult {
  apiKey: ApiKeyPublic;
  rawKey: string; // 明文 key，仅在创建时返回
}

export class ApiKeyService {
  async createApiKey(
    userId: string,
    name: string,
    expiresAt?: Date,
  ): Promise<CreateApiKeyResult> {
    // 限制每个用户最多 10 个活跃 key
    const activeCount = await ApiKey.countDocuments({
      user: userId,
      isActive: true,
    });
    if (activeCount >= 10) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Maximum 10 active API keys allowed. Please revoke an existing key first.",
      );
    }

    const { raw, prefix, hash } = generateApiKey();

    const doc = await ApiKey.create({
      user: userId,
      name: name.trim(),
      keyPrefix: prefix,
      keyHash: hash,
      expiresAt: expiresAt || null,
    });

    logger.info({ userId, keyId: doc._id, name }, "API key created");

    return {
      apiKey: this.toPublic(doc),
      rawKey: raw,
    };
  }

  async validateKey(rawKey: string): Promise<{
    userId: string;
    userEmail: string;
    userName: string;
    keyId: string;
    keyName: string;
  } | null> {
    if (!rawKey || !rawKey.startsWith("gdrive_")) {
      return null;
    }

    const hash = hashApiKey(rawKey);
    const key = await ApiKey.findOne({
      keyHash: hash,
      isActive: true,
    });

    if (!key) return null;

    // 检查过期
    if (key.expiresAt && key.expiresAt < new Date()) {
      // 过期的 key 自动停用
      key.isActive = false;
      await key.save();
      return null;
    }

    // 获取用户信息
    const user = await User.findById(key.user);
    if (!user) return null;

    // 非阻塞异步更新最后使用时间
    ApiKey.updateOne(
      { _id: key._id },
      { $set: { lastUsedAt: new Date() } },
    ).catch(() => {});

    return {
      userId: user._id.toString(),
      userEmail: user.email,
      userName: user.name,
      keyId: key._id.toString(),
      keyName: key.name,
    };
  }

  async listApiKeys(userId: string): Promise<ApiKeyPublic[]> {
    const keys = await ApiKey.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();

    return keys.map((k) => ({
      id: (k._id as any).toString(),
      name: k.name,
      keyPrefix: k.keyPrefix,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      isActive: k.isActive,
      createdAt: k.createdAt,
    }));
  }

  async revokeApiKey(keyId: string, userId: string): Promise<void> {
    const key = await ApiKey.findOne({ _id: keyId, user: userId });
    if (!key) {
      throw new AppError(StatusCodes.NOT_FOUND, "API key not found");
    }

    key.isActive = false;
    await key.save();

    logger.info({ userId, keyId }, "API key revoked");
  }

  async deleteApiKey(keyId: string, userId: string): Promise<void> {
    const result = await ApiKey.deleteOne({ _id: keyId, user: userId });
    if (result.deletedCount === 0) {
      throw new AppError(StatusCodes.NOT_FOUND, "API key not found");
    }
    logger.info({ userId, keyId }, "API key deleted");
  }

  private toPublic(doc: IApiKey): ApiKeyPublic {
    return {
      id: doc._id.toString(),
      name: doc.name,
      keyPrefix: doc.keyPrefix,
      lastUsedAt: doc.lastUsedAt,
      expiresAt: doc.expiresAt,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
    };
  }
}
