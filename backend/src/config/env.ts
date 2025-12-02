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
  MINIO_ENDPOINT: string;
  MINIO_PORT: number;
  MINIO_USE_SSL: boolean;
  MINIO_ACCESS_KEY: string;
  MINIO_SECRET_KEY: string;
  MINIO_PUBLIC_URL: string;
}

export const config: EnvConfig = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  mongodbUri: process.env.MONGODB_URI!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpire: process.env.JWT_EXPIRE || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  trashRetentionDays: parseInt(process.env.TRASH_RETENTION_DAYS || "30", 10),
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || "localhost",
  MINIO_PORT: parseInt(process.env.MINIO_PORT || "9000", 10),
  MINIO_USE_SSL: process.env.MINIO_USE_SSL === "true",
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || "minioadmin",
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || "minioadmin123",
  MINIO_PUBLIC_URL:
    process.env.MINIO_PUBLIC_URL ||
    `http://localhost:${process.env.MINIO_PORT || "9000"}`,
};

const requiredEnvVars = ["MONGODB_URI", "JWT_SECRET"];
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
});
