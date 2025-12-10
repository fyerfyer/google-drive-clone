import { testMinioClient } from "../setup";
import File from "../../models/File.model";
import { v4 as uuidv4 } from "uuid";
import { StorageService } from "../../services/storage.service";
import { BUCKETS } from "../../config/s3";
import { FileService } from "../../services/file.service";

export async function uploadTestFile(
  fileService: FileService,
  userId: string,
  folderId: string,
  fileName: string = "test.txt",
  content: string = "test content",
  hash?: string
) {
  const buffer = Buffer.from(content);
  let key: string | undefined;

  if (hash) {
    const existing = await File.findOne({ hash }).select("+key");
    if (existing && existing.key) {
      key = existing.key as string;
    }
  }

  if (!key) {
    key = `${userId}/file/${uuidv4()}/${fileName}`;
    await StorageService.putObject(
      BUCKETS.FILES,
      key,
      buffer,
      buffer.length,
      "text/plain"
    );
  }

  return await fileService.createFileRecord({
    userId,
    folderId,
    key,
    fileSize: buffer.length,
    mimeType: "text/plain",
    originalName: fileName,
    hash,
  });
}

export async function countObjectsInBucket(bucketName: string) {
  let count = 0;
  const stream = testMinioClient.listObjects(bucketName, "", true);
  for await (const obj of stream) {
    if (obj && obj.name) count++;
  }
  return count;
}
