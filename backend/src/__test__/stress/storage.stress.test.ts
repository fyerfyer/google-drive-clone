import { v4 as uuidv4 } from "uuid";
import { StorageService } from "../../services/storage.service";
import { BUCKETS } from "../../config/s3";
import { performance } from "perf_hooks";

describe("Storage Service Stress Tests", () => {
  const testBucket = BUCKETS.FILES;

  // Test configuration
  const STRESS_CONFIG = {
    // Small file stress test (< 1MB)
    SMALL_FILE: {
      iterations: 200,
      fileSize: 10 * 1024, // 10KB
      concurrent: 50,
    },
    // Medium file stress test (1-10MB)
    MEDIUM_FILE: {
      iterations: 100,
      fileSize: 1 * 1024 * 1024, // 1MB
      concurrent: 20,
    },
    // Large file stress test (> 10MB)
    LARGE_FILE: {
      iterations: 20,
      fileSize: 5 * 1024 * 1024, // 5MB
      concurrent: 5,
    },
    // Multipart upload stress test
    MULTIPART: {
      iterations: 10,
      fileSize: 10 * 1024 * 1024, // 10MB
      partSize: 5 * 1024 * 1024, // 5MB per part
      concurrent: 3,
    },
    // Download stress test
    DOWNLOAD: {
      iterations: 100,
      concurrent: 30,
    },
    // Delete stress test
    DELETE: {
      iterations: 200,
      concurrent: 50,
    },
    // Mixed operations stress test
    MIXED: {
      iterations: 100,
      concurrent: 20,
    },
  };

  // Performance metrics collection
  interface StressTestMetrics {
    totalOperations: number;
    successCount: number;
    failureCount: number;
    totalDuration: number;
    minLatency: number;
    maxLatency: number;
    avgLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    throughput: number; // operations per second
    errors: Array<{ error: string; count: number }>;
  }

  function calculateMetrics(
    durations: number[],
    errors: Error[]
  ): StressTestMetrics {
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const successCount = durations.length;
    const failureCount = errors.length;
    const totalOperations = successCount + failureCount;

    // Group errors by type
    const errorMap = new Map<string, number>();
    errors.forEach((err) => {
      const errorKey = err.message || "Unknown error";
      errorMap.set(errorKey, (errorMap.get(errorKey) || 0) + 1);
    });

    const errorsList = Array.from(errorMap.entries()).map(([error, count]) => ({
      error,
      count,
    }));

    return {
      totalOperations,
      successCount,
      failureCount,
      totalDuration,
      minLatency: sortedDurations[0] || 0,
      maxLatency: sortedDurations[sortedDurations.length - 1] || 0,
      avgLatency: successCount > 0 ? totalDuration / successCount : 0,
      p50Latency:
        sortedDurations[Math.floor(sortedDurations.length * 0.5)] || 0,
      p95Latency:
        sortedDurations[Math.floor(sortedDurations.length * 0.95)] || 0,
      p99Latency:
        sortedDurations[Math.floor(sortedDurations.length * 0.99)] || 0,
      throughput: totalDuration > 0 ? (successCount / totalDuration) * 1000 : 0,
      errors: errorsList,
    };
  }

  function printMetrics(testName: string, metrics: StressTestMetrics) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Stress Test Results: ${testName}`);
    console.log("=".repeat(80));
    console.log(`Total Operations:    ${metrics.totalOperations}`);
    console.log(
      `Successful:          ${metrics.successCount} (${((metrics.successCount / metrics.totalOperations) * 100).toFixed(2)}%)`
    );
    console.log(
      `Failed:              ${metrics.failureCount} (${((metrics.failureCount / metrics.totalOperations) * 100).toFixed(2)}%)`
    );
    console.log(`Total Duration:      ${metrics.totalDuration.toFixed(2)}ms`);
    console.log(`\nLatency Statistics:`);
    console.log(`  Min:               ${metrics.minLatency.toFixed(2)}ms`);
    console.log(`  Max:               ${metrics.maxLatency.toFixed(2)}ms`);
    console.log(`  Average:           ${metrics.avgLatency.toFixed(2)}ms`);
    console.log(`  P50 (Median):      ${metrics.p50Latency.toFixed(2)}ms`);
    console.log(`  P95:               ${metrics.p95Latency.toFixed(2)}ms`);
    console.log(`  P99:               ${metrics.p99Latency.toFixed(2)}ms`);
    console.log(
      `\nThroughput:          ${metrics.throughput.toFixed(2)} ops/sec`
    );

    if (metrics.errors.length > 0) {
      console.log(`\nErrors:`);
      metrics.errors.forEach(({ error, count }) => {
        console.log(`  ${error}: ${count} occurrences`);
      });
    }
    console.log("=".repeat(80));
  }

  async function runConcurrentOperations<T>(
    operations: Array<() => Promise<T>>,
    concurrency: number
  ): Promise<{ results: T[]; durations: number[]; errors: Error[] }> {
    const results: T[] = [];
    const durations: number[] = [];
    const errors: Error[] = [];

    for (let i = 0; i < operations.length; i += concurrency) {
      const batch = operations.slice(i, i + concurrency);
      const batchPromises = batch.map(async (op) => {
        const start = performance.now();
        try {
          const result = await op();
          const duration = performance.now() - start;
          durations.push(duration);
          return { success: true, result, duration };
        } catch (error) {
          const duration = performance.now() - start;
          errors.push(error as Error);
          return { success: false, error, duration };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((r) => {
        if (r.success && r.result) {
          results.push(r.result);
        }
      });
    }

    return { results, durations, errors };
  }

  describe("Small File Upload Stress Test", () => {
    it(`should handle ${STRESS_CONFIG.SMALL_FILE.iterations} small file uploads with concurrency ${STRESS_CONFIG.SMALL_FILE.concurrent}`, async () => {
      const config = STRESS_CONFIG.SMALL_FILE;
      const uploadedKeys: string[] = [];

      const operations = Array.from({ length: config.iterations }, (_, i) => {
        return async () => {
          const key = `stress-test/${uuidv4()}/small-${i}.txt`;
          const content = Buffer.alloc(config.fileSize);
          content.fill(`Content ${i}`);

          await StorageService.putObject(
            testBucket,
            key,
            content,
            content.length,
            "text/plain"
          );

          uploadedKeys.push(key);
          return key;
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Small File Upload", metrics);

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(config.iterations);
      expect(metrics.avgLatency).toBeLessThan(1000); // Average should be under 1s

      // Cleanup
      await runConcurrentOperations(
        uploadedKeys.map(
          (key) => () => StorageService.deleteObject(testBucket, key)
        ),
        50
      );
    }, 120000); // 2 minutes timeout
  });

  describe("Medium File Upload Stress Test", () => {
    it(`should handle ${STRESS_CONFIG.MEDIUM_FILE.iterations} medium file uploads with concurrency ${STRESS_CONFIG.MEDIUM_FILE.concurrent}`, async () => {
      const config = STRESS_CONFIG.MEDIUM_FILE;
      const uploadedKeys: string[] = [];

      const operations = Array.from({ length: config.iterations }, (_, i) => {
        return async () => {
          const key = `stress-test/${uuidv4()}/medium-${i}.bin`;
          const content = Buffer.alloc(config.fileSize);
          content.fill(i % 256);

          await StorageService.putObject(
            testBucket,
            key,
            content,
            content.length,
            "application/octet-stream"
          );

          uploadedKeys.push(key);
          return key;
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Medium File Upload", metrics);

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(config.iterations);
      expect(metrics.avgLatency).toBeLessThan(3000); // Average should be under 3s

      // Cleanup
      await runConcurrentOperations(
        uploadedKeys.map(
          (key) => () => StorageService.deleteObject(testBucket, key)
        ),
        50
      );
    }, 180000); // 3 minutes timeout
  });

  describe("Large File Upload Stress Test", () => {
    it(`should handle ${STRESS_CONFIG.LARGE_FILE.iterations} large file uploads with concurrency ${STRESS_CONFIG.LARGE_FILE.concurrent}`, async () => {
      const config = STRESS_CONFIG.LARGE_FILE;
      const uploadedKeys: string[] = [];

      const operations = Array.from({ length: config.iterations }, (_, i) => {
        return async () => {
          const key = `stress-test/${uuidv4()}/large-${i}.bin`;
          const content = Buffer.alloc(config.fileSize);
          content.fill((i * 7) % 256);

          await StorageService.putObject(
            testBucket,
            key,
            content,
            content.length,
            "application/octet-stream"
          );

          uploadedKeys.push(key);
          return key;
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Large File Upload", metrics);

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(config.iterations);
      expect(metrics.avgLatency).toBeLessThan(10000); // Average should be under 10s

      // Cleanup
      await runConcurrentOperations(
        uploadedKeys.map(
          (key) => () => StorageService.deleteObject(testBucket, key)
        ),
        50
      );
    }, 300000); // 5 minutes timeout
  });

  describe("Multipart Upload Stress Test", () => {
    it(`should handle ${STRESS_CONFIG.MULTIPART.iterations} multipart uploads with concurrency ${STRESS_CONFIG.MULTIPART.concurrent}`, async () => {
      const config = STRESS_CONFIG.MULTIPART;
      const uploadedKeys: string[] = [];

      const operations = Array.from({ length: config.iterations }, (_, i) => {
        return async () => {
          const key = `stress-test/${uuidv4()}/multipart-${i}.bin`;
          const mimeType = "application/octet-stream";

          // Create multipart upload
          const uploadId = await StorageService.createMultipartUpload(
            testBucket,
            key,
            mimeType
          );

          if (!uploadId) {
            throw new Error("Failed to create multipart upload");
          }

          // Upload parts
          const partCount = Math.ceil(config.fileSize / config.partSize);
          const parts: { ETag: string; PartNumber: number }[] = [];

          for (let partNum = 1; partNum <= partCount; partNum++) {
            const isLastPart = partNum === partCount;
            const partSize = isLastPart
              ? config.fileSize - (partNum - 1) * config.partSize
              : config.partSize;

            // Get presigned URL for part
            const presignedUrl = await StorageService.getPresignedPartUrl(
              testBucket,
              key,
              uploadId,
              partNum
            );

            // Simulate uploading part (we'll just list it for tracking)
            // In real scenario, client would upload to presignedUrl
            // For stress test, we'll mark it as completed
            parts.push({
              ETag: `"etag-${partNum}"`, // Simulated ETag
              PartNumber: partNum,
            });
          }

          // Note: In a real scenario, we would actually upload content to S3
          // For this stress test, we're testing the coordination logic
          // Complete multipart upload would fail without actual parts uploaded
          // So we'll abort instead for this test
          await StorageService.abortMultipartUpload(testBucket, key, uploadId);

          return key;
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Multipart Upload Coordination", metrics);

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(config.iterations);
      expect(metrics.avgLatency).toBeLessThan(5000); // Average should be under 5s
    }, 180000); // 3 minutes timeout
  });

  describe("File Download Stress Test", () => {
    let testKeys: string[];

    beforeAll(async () => {
      // Upload test files first
      const uploadOps = Array.from({ length: 10 }, (_, i) => async () => {
        const key = `stress-test/${uuidv4()}/download-test-${i}.txt`;
        const content = Buffer.alloc(50 * 1024); // 50KB
        content.fill(`Test content ${i}`);

        await StorageService.putObject(
          testBucket,
          key,
          content,
          content.length,
          "text/plain"
        );

        return key;
      });

      const { results } = await runConcurrentOperations(uploadOps, 5);
      testKeys = results;
    }, 60000);

    afterAll(async () => {
      // Cleanup
      if (testKeys && testKeys.length > 0) {
        await runConcurrentOperations(
          testKeys.map(
            (key) => () => StorageService.deleteObject(testBucket, key)
          ),
          10
        );
      }
    }, 60000);

    it(`should handle ${STRESS_CONFIG.DOWNLOAD.iterations} concurrent download URL generations`, async () => {
      const config = STRESS_CONFIG.DOWNLOAD;

      const operations = Array.from({ length: config.iterations }, (_, i) => {
        return async () => {
          const key = testKeys[i % testKeys.length];
          const url = await StorageService.getDownloadUrl(
            testBucket,
            key,
            3600,
            "inline"
          );

          return url;
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Download URL Generation", metrics);

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(config.iterations);
      expect(metrics.avgLatency).toBeLessThan(500); // Average should be under 500ms
    }, 120000);

    it("should handle concurrent object stream retrievals", async () => {
      // Upload fresh test files for streaming
      const uploadOps = Array.from({ length: 10 }, (_, i) => async () => {
        const key = `stress-test/${uuidv4()}/stream-test-${i}.txt`;
        const content = Buffer.alloc(50 * 1024); // 50KB
        content.fill(`Stream test ${i}`);

        await StorageService.putObject(
          testBucket,
          key,
          content,
          content.length,
          "text/plain"
        );

        return key;
      });

      const { results: streamTestKeys } = await runConcurrentOperations(
        uploadOps,
        5
      );

      const operations = Array.from({ length: 20 }, (_, i) => {
        return async () => {
          const key = streamTestKeys[i % streamTestKeys.length];
          const stream = await StorageService.getObjectStream(testBucket, key);

          // Consume the stream
          return new Promise<void>((resolve, reject) => {
            let dataReceived = false;
            stream.on("data", () => {
              dataReceived = true;
            });
            stream.on("end", () => {
              if (dataReceived) {
                resolve();
              } else {
                reject(new Error("No data received from stream"));
              }
            });
            stream.on("error", reject);
          });
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        10
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Object Stream Retrieval", metrics);

      // Cleanup
      await runConcurrentOperations(
        streamTestKeys.map(
          (key) => () => StorageService.deleteObject(testBucket, key)
        ),
        10
      );

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(20);
      expect(metrics.avgLatency).toBeLessThan(2000); // Average should be under 2s
    }, 120000);
  });

  describe("File Deletion Stress Test", () => {
    let testKeys: string[];

    beforeAll(async () => {
      // Upload test files first
      const config = STRESS_CONFIG.DELETE;
      const uploadOps = Array.from(
        { length: config.iterations },
        (_, i) => async () => {
          const key = `stress-test/${uuidv4()}/delete-test-${i}.txt`;
          const content = Buffer.from(`Delete test ${i}`);

          await StorageService.putObject(
            testBucket,
            key,
            content,
            content.length,
            "text/plain"
          );

          return key;
        }
      );

      const { results } = await runConcurrentOperations(uploadOps, 50);
      testKeys = results;
    }, 120000);

    it(`should handle ${STRESS_CONFIG.DELETE.iterations} concurrent deletions`, async () => {
      const config = STRESS_CONFIG.DELETE;

      const operations = testKeys.map((key) => async () => {
        await StorageService.deleteObject(testBucket, key);
        return key;
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("File Deletion", metrics);

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(config.iterations);
      expect(metrics.avgLatency).toBeLessThan(500); // Average should be under 500ms

      // Verify all deleted
      const existenceChecks = await Promise.all(
        testKeys.map((key) => StorageService.checkObjectExists(testBucket, key))
      );
      expect(existenceChecks.every((exists) => !exists)).toBe(true);
    }, 120000);
  });

  describe("Mixed Operations Stress Test", () => {
    it(`should handle ${STRESS_CONFIG.MIXED.iterations} mixed operations (upload, download, metadata, delete)`, async () => {
      const config = STRESS_CONFIG.MIXED;
      const uploadedKeys: string[] = [];

      const operations = Array.from({ length: config.iterations }, (_, i) => {
        const operation = i % 4;

        if (operation === 0) {
          // Upload operation
          return async () => {
            const key = `stress-test/${uuidv4()}/mixed-${i}.txt`;
            const content = Buffer.alloc(20 * 1024); // 20KB
            content.fill(i % 256);

            await StorageService.putObject(
              testBucket,
              key,
              content,
              content.length,
              "text/plain"
            );

            uploadedKeys.push(key);
            return { operation: "upload", key };
          };
        } else if (operation === 1 && uploadedKeys.length > 0) {
          // Download URL generation
          return async () => {
            const key =
              uploadedKeys[Math.floor(Math.random() * uploadedKeys.length)];
            const url = await StorageService.getDownloadUrl(testBucket, key);
            return { operation: "download", key, url };
          };
        } else if (operation === 2 && uploadedKeys.length > 0) {
          // Metadata retrieval
          return async () => {
            const key =
              uploadedKeys[Math.floor(Math.random() * uploadedKeys.length)];
            const metadata = await StorageService.getObjectMetadata(
              testBucket,
              key
            );
            return { operation: "metadata", key, metadata };
          };
        } else if (operation === 3 && uploadedKeys.length > 0) {
          // Check existence
          return async () => {
            const key =
              uploadedKeys[Math.floor(Math.random() * uploadedKeys.length)];
            const exists = await StorageService.checkObjectExists(
              testBucket,
              key
            );
            return { operation: "exists", key, exists };
          };
        } else {
          // Fallback to upload if no files available yet
          return async () => {
            const key = `stress-test/${uuidv4()}/mixed-fallback-${i}.txt`;
            const content = Buffer.from(`Fallback ${i}`);

            await StorageService.putObject(
              testBucket,
              key,
              content,
              content.length,
              "text/plain"
            );

            uploadedKeys.push(key);
            return { operation: "upload", key };
          };
        }
      });

      const { durations, errors } = await runConcurrentOperations(
        operations as Array<() => Promise<{ operation: string; key: string }>>,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Mixed Operations", metrics);

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(config.iterations);
      expect(metrics.avgLatency).toBeLessThan(2000); // Average should be under 2s

      // Cleanup
      if (uploadedKeys.length > 0) {
        await runConcurrentOperations(
          uploadedKeys.map(
            (key) => () => StorageService.deleteObject(testBucket, key)
          ),
          50
        );
      }
    }, 180000); // 3 minutes timeout
  });

  describe("Object Existence Check Stress Test", () => {
    let existingKeys: string[];
    let nonExistentKeys: string[];

    beforeAll(async () => {
      // Upload some test files
      const uploadOps = Array.from({ length: 20 }, (_, i) => async () => {
        const key = `stress-test/${uuidv4()}/existence-${i}.txt`;
        const content = Buffer.from(`Existence test ${i}`);

        await StorageService.putObject(
          testBucket,
          key,
          content,
          content.length,
          "text/plain"
        );

        return key;
      });

      const { results } = await runConcurrentOperations(uploadOps, 10);
      existingKeys = results;

      // Generate non-existent keys
      nonExistentKeys = Array.from(
        { length: 20 },
        (_, i) => `stress-test/${uuidv4()}/non-existent-${i}.txt`
      );
    }, 60000);

    afterAll(async () => {
      // Cleanup
      if (existingKeys && existingKeys.length > 0) {
        await runConcurrentOperations(
          existingKeys.map(
            (key) => () => StorageService.deleteObject(testBucket, key)
          ),
          10
        );
      }
    }, 60000);

    it("should handle concurrent existence checks for existing files", async () => {
      const operations = Array.from({ length: 100 }, (_, i) => {
        return async () => {
          const key = existingKeys[i % existingKeys.length];
          const exists = await StorageService.checkObjectExists(
            testBucket,
            key
          );
          return exists;
        };
      });

      const { durations, errors, results } = await runConcurrentOperations(
        operations,
        30
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Existence Check (Existing Files)", metrics);

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(results.every((exists) => exists === true)).toBe(true);
      expect(metrics.avgLatency).toBeLessThan(200); // Average should be under 200ms
    }, 60000);

    it("should handle concurrent existence checks for non-existent files", async () => {
      const operations = Array.from({ length: 100 }, (_, i) => {
        return async () => {
          const key = nonExistentKeys[i % nonExistentKeys.length];
          const exists = await StorageService.checkObjectExists(
            testBucket,
            key
          );
          return exists;
        };
      });

      const { durations, errors, results } = await runConcurrentOperations(
        operations,
        30
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Existence Check (Non-existent Files)", metrics);

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(results.every((exists) => exists === false)).toBe(true);
      expect(metrics.avgLatency).toBeLessThan(200); // Average should be under 200ms
    }, 60000);
  });

  describe("Presigned URL Generation Stress Test", () => {
    it("should handle concurrent presigned URL generation for uploads", async () => {
      const operations = Array.from({ length: 200 }, (_, i) => {
        return async () => {
          const key = `stress-test/${uuidv4()}/presigned-${i}.txt`;
          const url = await StorageService.getPutUrl(
            testBucket,
            key,
            "text/plain",
            3600
          );
          return url;
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        50
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Presigned Upload URL Generation", metrics);

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(200);
      expect(metrics.avgLatency).toBeLessThan(300); // Average should be under 300ms
    }, 60000);

    it("should handle concurrent presigned URL generation for multipart uploads", async () => {
      const testKey = `stress-test/${uuidv4()}/multipart-presigned.bin`;
      const uploadId = await StorageService.createMultipartUpload(
        testBucket,
        testKey,
        "application/octet-stream"
      );

      const operations = Array.from({ length: 100 }, (_, i) => {
        return async () => {
          const partNumber = (i % 20) + 1;
          const url = await StorageService.getPresignedPartUrl(
            testBucket,
            testKey,
            uploadId!,
            partNumber
          );
          return url;
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        30
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Presigned Multipart Part URL Generation", metrics);

      // Assertions
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(100);
      expect(metrics.avgLatency).toBeLessThan(300); // Average should be under 300ms

      // Cleanup
      await StorageService.abortMultipartUpload(testBucket, testKey, uploadId!);
    }, 60000);
  });
});
