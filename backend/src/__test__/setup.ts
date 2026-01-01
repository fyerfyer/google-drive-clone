import mongoose from "mongoose";
import { Client } from "minio";
import dotenv from "dotenv";
import path from "path";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { Worker } from "bullmq";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const httpServer = createServer();
const testSocketIO = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let serverStarted = false;

testSocketIO.on("connection", (socket) => {});

jest.mock("../lib/socket", () => {
  return {
    initSocket: jest.fn().mockReturnValue(testSocketIO),
    getSocket: jest.fn().mockReturnValue(testSocketIO),
  };
});

import { redisClient } from "../config/redis";

let notificationWorker: Worker | null = null;
let maintainanceWorker: Worker | null = null;

export const testMinioClient = new Client({
  endPoint: "localhost",
  port: 9012,
  useSSL: false,
  accessKey: "testminio",
  secretKey: "testminio123",
});

// 测试 buckets
export const TEST_BUCKETS = {
  AVATARS: "avatars",
  FILES: "files",
};

if (process.env.MINIO_ENDPOINT) {
  const raw = process.env.MINIO_ENDPOINT;
  const port = process.env.MINIO_PORT ? `:${process.env.MINIO_PORT}` : "";
  if (!/^https?:\/\//i.test(raw)) {
    process.env.MINIO_ENDPOINT = `http://${raw}${port}`;
  } else if (!raw.includes(":")) {
    process.env.MINIO_ENDPOINT = `${raw}${port}`;
  }
} else {
  process.env.MINIO_ENDPOINT = `http://localhost:${process.env.MINIO_PORT || 9000}`;
}

const TEST_MONGODB_URI =
  "mongodb://localhost:27018/gdrive-test?directConnection=true";

beforeAll(async () => {
  if (!serverStarted) {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        serverStarted = true;
        const address = httpServer.address();
        const port = typeof address === "object" ? address?.port : 0;
        console.log(`Test Socket.IO server started on port ${port}`);
        resolve();
      });
    });
  }

  await mongoose.connect(TEST_MONGODB_URI);

  await redisClient.ping();
  console.log("Redis connected for tests");

  const { notificationWorker: nWorker } =
    await import("../lib/queue/notification.worker");
  const { maintainanceWorker: mWorker } =
    await import("../lib/queue/cron.worker");
  notificationWorker = nWorker;
  maintainanceWorker = mWorker;

  console.log("Workers initialized");

  for (const bucket of Object.values(TEST_BUCKETS)) {
    const exists = await testMinioClient.bucketExists(bucket);
    if (!exists) {
      await testMinioClient.makeBucket(bucket);
      console.log(`Created test bucket: ${bucket}`);
    }
  }
}, 30000);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  for (const bucket of Object.values(TEST_BUCKETS)) {
    const objectsStream = testMinioClient.listObjects(bucket, "", true);
    const objectsToDelete: string[] = [];

    for await (const obj of objectsStream) {
      if (obj.name) {
        objectsToDelete.push(obj.name);
      }
    }

    if (objectsToDelete.length > 0) {
      await testMinioClient.removeObjects(bucket, objectsToDelete);
    }
  }
}, 30000);

afterAll(async () => {
  if (notificationWorker) {
    await notificationWorker.close();
    console.log("Notification worker closed");
  }
  if (maintainanceWorker) {
    await maintainanceWorker.close();
    console.log("Maintenance worker closed");
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  await new Promise<void>((resolve) => {
    testSocketIO.close(() => {
      console.log("Socket.IO closed");
      httpServer.close(() => {
        console.log("HTTP server closed");
        resolve();
      });
    });
  });

  await mongoose.connection.close();
  console.log("MongoDB connection closed");

  try {
    await redisClient.quit();
    console.log("Redis connection closed");
  } catch (error) {
    console.log("Redis connection already closed or failed to close");
  }

  console.log("Test cleanup completed");
}, 30000);
