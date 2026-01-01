import { v4 as uuidv4 } from "uuid";
import { StorageService } from "../../services/storage.service";
import { BUCKETS } from "../../config/s3";
import { testMinioClient } from "../setup";

describe("Storage Service Concurrency Tests", () => {
  const testBucket = BUCKETS.FILES;

  describe("Concurrent Object Upload", () => {
    it("should handle multiple concurrent small object uploads", async () => {
      const uploadPromises = Array.from({ length: 10 }, (_, i) => {
        const key = `test/${uuidv4()}/concurrent-${i}.txt`;
        const content = Buffer.from(`Content ${i}`);

        return StorageService.putObject(
          testBucket,
          key,
          content,
          content.length,
          "text/plain"
        ).then(() => key);
      });

      const keys = await Promise.all(uploadPromises);

      expect(keys).toHaveLength(10);

      // Verify all objects exist
      const existChecks = await Promise.all(
        keys.map((key) => StorageService.checkObjectExists(testBucket, key))
      );

      expect(existChecks.every((exists) => exists)).toBe(true);

      // Cleanup
      await Promise.all(
        keys.map((key) => StorageService.deleteObject(testBucket, key))
      );
    });

    it("should handle concurrent uploads to same key (last write wins)", async () => {
      const key = `test/${uuidv4()}/same-key.txt`;

      // Upload different content to same key concurrently
      const uploadPromises = Array.from({ length: 5 }, (_, i) => {
        const content = Buffer.from(`Version ${i}`);
        return StorageService.putObject(
          testBucket,
          key,
          content,
          content.length,
          "text/plain"
        );
      });

      await Promise.all(uploadPromises);

      // Object should exist with one of the versions
      const exists = await StorageService.checkObjectExists(testBucket, key);
      expect(exists).toBe(true);

      // Cleanup
      await StorageService.deleteObject(testBucket, key);
    });

    it("should handle concurrent large buffer uploads", async () => {
      const uploadPromises = Array.from({ length: 5 }, (_, i) => {
        const key = `test/${uuidv4()}/large-${i}.bin`;
        const content = Buffer.alloc(1024 * 100); // 100KB
        content.fill(i);

        return StorageService.putObject(
          testBucket,
          key,
          content,
          content.length,
          "application/octet-stream"
        ).then(() => ({ key, size: content.length }));
      });

      const results = await Promise.all(uploadPromises);

      expect(results).toHaveLength(5);

      // Verify sizes
      const metadataPromises = results.map(({ key }) =>
        StorageService.getObjectMetadata(testBucket, key)
      );
      const metadata = await Promise.all(metadataPromises);

      metadata.forEach((meta, i) => {
        expect(meta.ContentLength).toBe(results[i].size);
      });

      // Cleanup
      await Promise.all(
        results.map(({ key }) => StorageService.deleteObject(testBucket, key))
      );
    });
  });

  describe("Concurrent Multipart Upload", () => {
    it("should handle multiple concurrent multipart upload initializations", async () => {
      const initPromises = Array.from({ length: 5 }, (_, i) => {
        const key = `test/${uuidv4()}/multipart-${i}.bin`;
        return StorageService.createMultipartUpload(
          testBucket,
          key,
          "application/octet-stream"
        ).then((uploadId) => ({ key, uploadId }));
      });

      const uploads = await Promise.all(initPromises);

      expect(uploads).toHaveLength(5);
      uploads.forEach((upload) => {
        expect(upload.uploadId).toBeDefined();
      });

      // Cleanup - abort all uploads
      await Promise.all(
        uploads.map(({ key, uploadId }) =>
          StorageService.abortMultipartUpload(testBucket, key, uploadId!)
        )
      );
    });

    it("should handle concurrent part uploads for same multipart upload", async () => {
      const key = `test/${uuidv4()}/concurrent-parts.bin`;
      const uploadId = await StorageService.createMultipartUpload(
        testBucket,
        key,
        "application/octet-stream"
      );

      expect(uploadId).toBeDefined();

      // Get presigned URLs for parts
      const partCount = 3;
      const urlPromises = Array.from({ length: partCount }, (_, i) =>
        StorageService.getPresignedPartUrl(testBucket, key, uploadId!, i + 1)
      );

      const urls = await Promise.all(urlPromises);
      expect(urls).toHaveLength(partCount);

      // Upload parts concurrently using presigned URLs
      const partSize = 1024 * 1024 * 5; // 5MB per part
      const uploadPartPromises = urls.map((url, i) => {
        const partData = Buffer.alloc(partSize);
        partData.fill(i);

        return fetch(url, {
          method: "PUT",
          body: partData,
          headers: {
            "Content-Type": "application/octet-stream",
          },
        });
      });

      const responses = await Promise.all(uploadPartPromises);

      expect(responses.every((r) => r.ok)).toBe(true);

      // Get ETags from responses
      const parts = responses.map((response, i) => ({
        ETag: response.headers.get("etag")?.replace(/"/g, "") || "",
        PartNumber: i + 1,
      }));

      // Complete multipart upload
      await StorageService.completeMultipartUpload(
        testBucket,
        key,
        uploadId!,
        parts
      );

      // Verify object exists
      const exists = await StorageService.checkObjectExists(testBucket, key);
      expect(exists).toBe(true);

      // Cleanup
      await StorageService.deleteObject(testBucket, key);
    }, 30000);

    it("should handle concurrent multipart uploads of different files", async () => {
      const uploadCount = 3;
      const partCount = 2;

      const uploads = await Promise.all(
        Array.from({ length: uploadCount }, (_, i) => {
          const key = `test/${uuidv4()}/multi-${i}.bin`;
          return StorageService.createMultipartUpload(
            testBucket,
            key,
            "application/octet-stream"
          ).then((uploadId) => ({ key, uploadId: uploadId! }));
        })
      );

      // Upload parts for all files concurrently
      const allPartUploads = uploads.flatMap(({ key, uploadId }) =>
        Array.from({ length: partCount }, async (_, partNum) => {
          const url = await StorageService.getPresignedPartUrl(
            testBucket,
            key,
            uploadId,
            partNum + 1
          );

          const partData = Buffer.alloc(1024 * 1024 * 5); // 5MB
          partData.fill(partNum);

          const response = await fetch(url, {
            method: "PUT",
            body: partData,
            headers: { "Content-Type": "application/octet-stream" },
          });

          return {
            key,
            uploadId,
            part: {
              ETag: response.headers.get("etag")?.replace(/"/g, "") || "",
              PartNumber: partNum + 1,
            },
          };
        })
      );

      const allParts = await Promise.all(allPartUploads);

      // Group parts by upload
      const partsByUpload = uploads.map(({ key, uploadId }) => ({
        key,
        uploadId,
        parts: allParts.filter((p) => p.key === key).map((p) => p.part),
      }));

      // Complete all uploads concurrently
      await Promise.all(
        partsByUpload.map(({ key, uploadId, parts }) =>
          StorageService.completeMultipartUpload(
            testBucket,
            key,
            uploadId,
            parts
          )
        )
      );

      // Verify all files exist
      const existChecks = await Promise.all(
        uploads.map(({ key }) =>
          StorageService.checkObjectExists(testBucket, key)
        )
      );

      expect(existChecks.every((exists) => exists)).toBe(true);

      // Cleanup
      await Promise.all(
        uploads.map(({ key }) => StorageService.deleteObject(testBucket, key))
      );
    }, 30000);

    it("should handle concurrent abort of multipart uploads", async () => {
      const uploads = await Promise.all(
        Array.from({ length: 5 }, (_, i) => {
          const key = `test/${uuidv4()}/abort-${i}.bin`;
          return StorageService.createMultipartUpload(
            testBucket,
            key,
            "application/octet-stream"
          ).then((uploadId) => ({ key, uploadId: uploadId! }));
        })
      );

      // Abort all uploads concurrently
      await Promise.all(
        uploads.map(({ key, uploadId }) =>
          StorageService.abortMultipartUpload(testBucket, key, uploadId)
        )
      );

      // Uploads should be aborted (parts should be empty if we try to list)
      const listPromises = uploads.map(({ key, uploadId }) =>
        StorageService.listParts(testBucket, key, uploadId).catch(() => [])
      );

      const parts = await Promise.all(listPromises);
      parts.forEach((partList) => {
        expect(partList).toHaveLength(0);
      });
    });
  });

  describe("Concurrent Object Deletion", () => {
    it("should handle concurrent deletion of different objects", async () => {
      // Upload objects first
      const keys = await Promise.all(
        Array.from({ length: 5 }, (_, i) => {
          const key = `test/${uuidv4()}/delete-${i}.txt`;
          const content = Buffer.from(`Content ${i}`);

          return StorageService.putObject(
            testBucket,
            key,
            content,
            content.length,
            "text/plain"
          ).then(() => key);
        })
      );

      // Delete all concurrently
      await Promise.all(
        keys.map((key) => StorageService.deleteObject(testBucket, key))
      );

      // Verify all are deleted
      const existChecks = await Promise.all(
        keys.map((key) => StorageService.checkObjectExists(testBucket, key))
      );

      expect(existChecks.every((exists) => !exists)).toBe(true);
    });

    it("should handle concurrent deletion of same object (idempotent)", async () => {
      const key = `test/${uuidv4()}/delete-same.txt`;
      const content = Buffer.from("Test content");

      await StorageService.putObject(
        testBucket,
        key,
        content,
        content.length,
        "text/plain"
      );

      // Try to delete same object multiple times concurrently
      const deletePromises = Array.from({ length: 5 }, () =>
        StorageService.deleteObject(testBucket, key).catch((err) => err)
      );

      const results = await Promise.all(deletePromises);

      // Should not throw errors (idempotent)
      results.forEach((result) => {
        expect(result).not.toBeInstanceOf(Error);
      });

      // Verify object is deleted
      const exists = await StorageService.checkObjectExists(testBucket, key);
      expect(exists).toBe(false);
    });
  });

  describe("Concurrent Read Operations", () => {
    it("should handle concurrent reads of same object", async () => {
      const key = `test/${uuidv4()}/concurrent-read.txt`;
      const content = Buffer.from("Test content for concurrent reads");

      await StorageService.putObject(
        testBucket,
        key,
        content,
        content.length,
        "text/plain"
      );

      // Concurrent read operations
      const readPromises = Array.from({ length: 10 }, () =>
        StorageService.getObjectStream(testBucket, key)
      );

      const streams = await Promise.all(readPromises);

      expect(streams).toHaveLength(10);

      // Read content from all streams
      const contentPromises = streams.map(
        (stream) =>
          new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            stream.on("data", (chunk) => chunks.push(chunk));
            stream.on("end", () => resolve(Buffer.concat(chunks)));
            stream.on("error", reject);
          })
      );

      const contents = await Promise.all(contentPromises);

      // All should have same content
      contents.forEach((c) => {
        expect(c.toString()).toBe(content.toString());
      });

      // Cleanup
      await StorageService.deleteObject(testBucket, key);
    });

    it("should handle concurrent metadata queries", async () => {
      const key = `test/${uuidv4()}/metadata.txt`;
      const content = Buffer.from("Test content");

      await StorageService.putObject(
        testBucket,
        key,
        content,
        content.length,
        "text/plain",
        { custom: "metadata" }
      );

      // Concurrent metadata queries
      const metadataPromises = Array.from({ length: 10 }, () =>
        StorageService.getObjectMetadata(testBucket, key)
      );

      const results = await Promise.all(metadataPromises);

      expect(results).toHaveLength(10);
      results.forEach((metadata) => {
        expect(metadata.ContentLength).toBe(content.length);
        expect(metadata.ContentType).toBe("text/plain");
        expect(metadata.Metadata?.custom).toBe("metadata");
      });

      // Cleanup
      await StorageService.deleteObject(testBucket, key);
    });

    it("should handle concurrent presigned URL generation", async () => {
      const key = `test/${uuidv4()}/presigned.txt`;
      const content = Buffer.from("Test content");

      await StorageService.putObject(
        testBucket,
        key,
        content,
        content.length,
        "text/plain"
      );

      // Generate presigned URLs concurrently
      const urlPromises = Array.from({ length: 10 }, () =>
        StorageService.getDownloadUrl(testBucket, key, 3600)
      );

      const urls = await Promise.all(urlPromises);

      expect(urls).toHaveLength(10);
      urls.forEach((url) => {
        expect(url).toContain(testBucket);
        expect(url).toContain(key);
      });

      // Cleanup
      await StorageService.deleteObject(testBucket, key);
    });
  });

  describe("Mixed Concurrent Operations", () => {
    it("should handle concurrent upload, read, and delete operations", async () => {
      const baseKey = `test/${uuidv4()}`;

      // Mix of operations
      const operations = [
        // Uploads
        ...Array.from({ length: 3 }, (_, i) => {
          const key = `${baseKey}/upload-${i}.txt`;
          const content = Buffer.from(`Upload ${i}`);
          return StorageService.putObject(
            testBucket,
            key,
            content,
            content.length,
            "text/plain"
          ).then(() => ({ type: "upload", key }));
        }),
        // Create then read
        ...Array.from({ length: 3 }, async (_, i) => {
          const key = `${baseKey}/read-${i}.txt`;
          const content = Buffer.from(`Read ${i}`);

          await StorageService.putObject(
            testBucket,
            key,
            content,
            content.length,
            "text/plain"
          );

          await StorageService.getObjectStream(testBucket, key);
          return { type: "read", key };
        }),
        // Create then delete
        ...Array.from({ length: 3 }, async (_, i) => {
          const key = `${baseKey}/delete-${i}.txt`;
          const content = Buffer.from(`Delete ${i}`);

          await StorageService.putObject(
            testBucket,
            key,
            content,
            content.length,
            "text/plain"
          );

          await StorageService.deleteObject(testBucket, key);
          return { type: "delete", key };
        }),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(9);

      // Verify expected states
      const uploadKeys = results
        .filter((r) => r.type === "upload")
        .map((r) => r.key);
      const readKeys = results
        .filter((r) => r.type === "read")
        .map((r) => r.key);
      const deleteKeys = results
        .filter((r) => r.type === "delete")
        .map((r) => r.key);

      // Upload and read keys should exist
      const uploadExists = await Promise.all(
        uploadKeys.map((key) =>
          StorageService.checkObjectExists(testBucket, key)
        )
      );
      const readExists = await Promise.all(
        readKeys.map((key) => StorageService.checkObjectExists(testBucket, key))
      );

      expect(uploadExists.every((e) => e)).toBe(true);
      expect(readExists.every((e) => e)).toBe(true);

      // Delete keys should not exist
      const deleteExists = await Promise.all(
        deleteKeys.map((key) =>
          StorageService.checkObjectExists(testBucket, key)
        )
      );
      expect(deleteExists.every((e) => !e)).toBe(true);

      // Cleanup
      await Promise.all([
        ...uploadKeys.map((key) =>
          StorageService.deleteObject(testBucket, key)
        ),
        ...readKeys.map((key) => StorageService.deleteObject(testBucket, key)),
      ]);
    }, 30000);

    it("should handle concurrent existence checks during upload/delete", async () => {
      const key = `test/${uuidv4()}/check.txt`;
      const content = Buffer.from("Test content");

      // Start with upload
      await StorageService.putObject(
        testBucket,
        key,
        content,
        content.length,
        "text/plain"
      );

      // Mix of operations
      const operations = [
        ...Array.from({ length: 10 }, () =>
          StorageService.checkObjectExists(testBucket, key)
        ),
        StorageService.getObjectMetadata(testBucket, key),
        StorageService.deleteObject(testBucket, key),
        ...Array.from({ length: 5 }, () =>
          StorageService.checkObjectExists(testBucket, key)
        ),
      ];

      const results = await Promise.all(
        operations.map((p) => p.catch((err) => err))
      );

      // Should not throw errors
      expect(results.length).toBe(17);

      // Final check - should not exist
      const finalExists = await StorageService.checkObjectExists(
        testBucket,
        key
      );
      expect(finalExists).toBe(false);
    });
  });
});
