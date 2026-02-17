import dotenv from "dotenv";
import path from "path";

// Load environment-specific .env file
let envFile = ".env";
if (process.env.NODE_ENV === "test") {
  envFile = ".env.test";
} else if (process.env.NODE_ENV === "mcp") {
  envFile = ".env.mcp";
}
dotenv.config({ path: path.resolve(__dirname, "../../", envFile) });

interface EnvConfig {
  port: number;
  nodeEnv: string;
  mongodbUri: string;
  jwtSecret: string;
  jwtExpire: string;
  corsOrigin: string;
  trashRetentionDays: number;
  minioEndpoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioPublicUrl: string;

  redisUrl: string;
  frontendUrl: string;
  // OnlyOffice 服务后端回调 URL，供 OnlyOffice Document Server 下载文件内容使用
  officeCallbackUrl: string;
  // OnlyOffice Document Server URL，供前端配置编辑器使用
  onlyofficeUrl: string;
  onlyofficeJwtSecret: string;
  onlyofficeJwtEnabled: boolean;

  // AI Agent (LLM) configuration
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
}

export const config: EnvConfig = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  mongodbUri: process.env.MONGODB_URI!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpire: process.env.JWT_EXPIRE || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  trashRetentionDays: parseInt(process.env.TRASH_RETENTION_DAYS || "30", 10),
  minioEndpoint: process.env.MINIO_ENDPOINT || "http://localhost:9000",
  minioAccessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  minioSecretKey: process.env.MINIO_SECRET_KEY || "minioadmin123",
  minioPublicUrl:
    process.env.MINIO_PUBLIC_URL ||
    `http://localhost:${process.env.MINIO_PORT || "9000"}`,
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  officeCallbackUrl:
    process.env.OFFICE_CALLBACK_URL ||
    `http://host.docker.internal:${process.env.PORT || "5000"}`,
  onlyofficeUrl: process.env.ONLYOFFICE_URL || "http://localhost:8080",
  onlyofficeJwtSecret: process.env.ONLYOFFICE_JWT_SECRET || "my_secret_jwt_key",
  onlyofficeJwtEnabled: process.env.ONLYOFFICE_JWT_ENABLED === "true",

  // AI Agent (LLM) configuration
  llmApiKey: process.env.LLM_API_KEY || "",
  llmBaseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
  llmModel: process.env.LLM_MODEL || "gpt-4o-mini",
};

const requiredEnvVars = ["MONGODB_URI", "JWT_SECRET"];
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
});
