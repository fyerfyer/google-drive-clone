import dotenv from "dotenv";
import path from "path";

// Load environment-specific .env file
const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
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
};

const requiredEnvVars = ["MONGODB_URI", "JWT_SECRET"];
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
});
