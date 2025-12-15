import mongoose from "mongoose";
import { Client } from "minio";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

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
  await mongoose.connect(TEST_MONGODB_URI);

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
  await mongoose.connection.close();
}, 30000);
