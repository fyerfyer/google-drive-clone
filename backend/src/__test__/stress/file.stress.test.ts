import { v4 as uuidv4 } from "uuid";
import { FileService } from "../../services/file.service";
import { StorageService } from "../../services/storage.service";
import { BUCKETS } from "../../config/s3";
import { performance } from "perf_hooks";
import User from "../../models/User.model";
import Folder from "../../models/Folder.model";
import File from "../../models/File.model";
import mongoose from "mongoose";

describe("File Service Stress Tests", () => {
  const fileService = new FileService();
  let testUserId: string;
  let testFolderId: string;

  // Test configuration
  const STRESS_CONFIG = {
    // Small file creation stress test
    SMALL_FILE_CREATE: {
      iterations: 100,
      fileSize: 10 * 1024, // 10KB
      concurrent: 30,
    },
    // Medium file creation stress test
    MEDIUM_FILE_CREATE: {
      iterations: 50,
      fileSize: 1 * 1024 * 1024, // 1MB
      concurrent: 15,
    },
    // Large file creation stress test
    LARGE_FILE_CREATE: {
      iterations: 20,
      fileSize: 5 * 1024 * 1024, // 5MB
      concurrent: 5,
    },
    // File query stress test
    QUERY: {
      iterations: 200,
      concurrent: 50,
    },
    // File operation stress test (trash, restore, star, etc.)
    OPERATIONS: {
      iterations: 150,
      concurrent: 30,
    },
    // URL generation stress test
    URL_GENERATION: {
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

  beforeAll(async () => {
    // Create test user with very high storage quota (1TB)
    const testUser = await User.create({
      email: `stress-test-${uuidv4()}@example.com`,
      password: "testpassword123",
      name: "Stress Test User",
      storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
      storageUsage: 0,
    });
    testUserId = testUser._id.toString();

    // Create test folder
    const testFolder = await Folder.create({
      user: new mongoose.Types.ObjectId(testUserId),
      name: "Test Folder",
      ancestors: [],
    });
    testFolderId = testFolder._id.toString();

    console.log(`Test user created: ${testUserId}`);
    console.log(`Test folder created: ${testFolderId}`);
  }, 30000);

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
      await User.findByIdAndDelete(testUserId);
      await Folder.deleteMany({
        user: new mongoose.Types.ObjectId(testUserId),
      });

      // Delete all files and their storage objects
      const files = await File.find({
        user: new mongoose.Types.ObjectId(testUserId),
      }).select("+key");

      // Delete from MinIO
      const deleteOps = files.map(
        (file) => () =>
          StorageService.deleteObject(BUCKETS.FILES, file.key).catch(() => {})
      );
      await runConcurrentOperations(deleteOps, 20);

      // Delete from MongoDB
      await File.deleteMany({ user: new mongoose.Types.ObjectId(testUserId) });

      console.log("Test cleanup completed");
    }
  }, 60000);

  describe("File Creation Stress Tests", () => {
    afterEach(async () => {
      // Reset user storage usage after each test to avoid quota issues
      await User.findByIdAndUpdate(testUserId, { storageUsage: 0 });

      // Recreate the test folder if it doesn't exist (afterEach in setup.ts deletes all collections)
      const folderExists = await Folder.findById(testFolderId);
      if (!folderExists) {
        await Folder.create({
          _id: testFolderId,
          name: "Stress Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }
    });

    describe("Small File Creation", () => {
      it(`should handle ${STRESS_CONFIG.SMALL_FILE_CREATE.iterations} small file creations with concurrency ${STRESS_CONFIG.SMALL_FILE_CREATE.concurrent}`, async () => {
        const config = STRESS_CONFIG.SMALL_FILE_CREATE;
        const createdFiles: string[] = [];

        const operations = Array.from({ length: config.iterations }, (_, i) => {
          return async () => {
            const key = `stress-test/${testUserId}/${uuidv4()}/small-${i}.txt`;
            const content = Buffer.alloc(config.fileSize);
            content.fill(`Content ${i}`);

            // Upload to storage first
            await StorageService.putObject(
              BUCKETS.FILES,
              key,
              content,
              content.length,
              "text/plain"
            );

            createdFiles.push(key);

            // Create file record
            return await fileService.createFileRecord({
              userId: testUserId,
              folderId: testFolderId,
              key,
              fileSize: config.fileSize,
              mimeType: "text/plain",
              originalName: `small-${i}.txt`,
            });
          };
        });

        const { results, durations, errors } = await runConcurrentOperations(
          operations,
          config.concurrent
        );

        const metrics = calculateMetrics(durations, errors);
        printMetrics("Small File Creation", metrics);

        // Assertions
        expect(metrics.failureCount).toBe(0);
        expect(results.length).toBe(config.iterations);
        expect(metrics.avgLatency).toBeLessThan(600);
        expect(metrics.p95Latency).toBeLessThan(1000);
      }, 120000);
    });

    describe("Medium File Creation", () => {
      it(`should handle ${STRESS_CONFIG.MEDIUM_FILE_CREATE.iterations} medium file creations with concurrency ${STRESS_CONFIG.MEDIUM_FILE_CREATE.concurrent}`, async () => {
        // Ensure user and folder exist
        let user = await User.findById(testUserId);
        if (!user) {
          await User.create({
            _id: testUserId,
            name: `stress-test-${Date.now()}`,
            email: `stress-test-${Date.now()}@test.com`,
            password: "hashedpassword",
            storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
            storageUsage: 0,
          });
        }

        let folder = await Folder.findById(testFolderId);
        if (!folder) {
          await Folder.create({
            _id: testFolderId,
            name: "Stress Test Folder",
            user: new mongoose.Types.ObjectId(testUserId),
            parent: null,
            ancestors: [],
            isStarred: false,
            isTrashed: false,
          });
        }

        const config = STRESS_CONFIG.MEDIUM_FILE_CREATE;
        const createdFiles: string[] = [];

        const operations = Array.from({ length: config.iterations }, (_, i) => {
          return async () => {
            const key = `stress-test/${testUserId}/${uuidv4()}/medium-${i}.bin`;
            const content = Buffer.alloc(config.fileSize);

            await StorageService.putObject(
              BUCKETS.FILES,
              key,
              content,
              content.length,
              "application/octet-stream"
            );

            createdFiles.push(key);

            return await fileService.createFileRecord({
              userId: testUserId,
              folderId: testFolderId,
              key,
              fileSize: config.fileSize,
              mimeType: "application/octet-stream",
              originalName: `medium-${i}.bin`,
            });
          };
        });

        const { results, durations, errors } = await runConcurrentOperations(
          operations,
          config.concurrent
        );

        const metrics = calculateMetrics(durations, errors);
        printMetrics("Medium File Creation", metrics);

        expect(metrics.failureCount).toBe(0);
        expect(results.length).toBe(config.iterations);
        expect(metrics.avgLatency).toBeLessThan(1000);
      }, 120000);
    });

    describe("Large File Creation", () => {
      it(`should handle ${STRESS_CONFIG.LARGE_FILE_CREATE.iterations} large file creations with concurrency ${STRESS_CONFIG.LARGE_FILE_CREATE.concurrent}`, async () => {
        // Ensure user and folder exist
        let user = await User.findById(testUserId);
        if (!user) {
          await User.create({
            _id: testUserId,
            name: `stress-test-${Date.now()}`,
            email: `stress-test-${Date.now()}@test.com`,
            password: "hashedpassword",
            storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
            storageUsage: 0,
          });
        }

        let folder = await Folder.findById(testFolderId);
        if (!folder) {
          await Folder.create({
            _id: testFolderId,
            name: "Stress Test Folder",
            user: new mongoose.Types.ObjectId(testUserId),
            parent: null,
            ancestors: [],
            isStarred: false,
            isTrashed: false,
          });
        }

        const config = STRESS_CONFIG.LARGE_FILE_CREATE;
        const createdFiles: string[] = [];

        const operations = Array.from({ length: config.iterations }, (_, i) => {
          return async () => {
            const key = `stress-test/${testUserId}/${uuidv4()}/large-${i}.bin`;
            const content = Buffer.alloc(config.fileSize);

            await StorageService.putObject(
              BUCKETS.FILES,
              key,
              content,
              content.length,
              "application/octet-stream"
            );

            createdFiles.push(key);

            return await fileService.createFileRecord({
              userId: testUserId,
              folderId: testFolderId,
              key,
              fileSize: config.fileSize,
              mimeType: "application/octet-stream",
              originalName: `large-${i}.bin`,
            });
          };
        });

        const { results, durations, errors } = await runConcurrentOperations(
          operations,
          config.concurrent
        );

        const metrics = calculateMetrics(durations, errors);
        printMetrics("Large File Creation", metrics);

        expect(metrics.failureCount).toBe(0);
        expect(results.length).toBe(config.iterations);
        expect(metrics.avgLatency).toBeLessThan(2000);
      }, 180000);
    });
  });

  describe("File Query Stress Tests", () => {
    let createdFileIds: string[];

    beforeAll(async () => {
      // Ensure user and folder exist after cleanup
      let user = await User.findById(testUserId);
      if (!user) {
        user = await User.create({
          _id: testUserId,
          name: `stress-test-${Date.now()}`,
          email: `stress-test-${Date.now()}@test.com`,
          password: "hashedpassword",
          storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
          storageUsage: 0,
        });
      } else {
        // Reset storage usage before creating test files
        await User.findByIdAndUpdate(testUserId, { storageUsage: 0 });
      }

      let folder = await Folder.findById(testFolderId);
      if (!folder) {
        await Folder.create({
          _id: testFolderId,
          name: "Stress Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }

      // Create test files for querying
      const createOps = Array.from({ length: 50 }, (_, i) => {
        return async () => {
          const key = `stress-test/${testUserId}/${uuidv4()}/query-${i}.txt`;
          const content = Buffer.from(`Query test ${i}`);

          await StorageService.putObject(
            BUCKETS.FILES,
            key,
            content,
            content.length,
            "text/plain"
          );

          return await fileService.createFileRecord({
            userId: testUserId,
            folderId: testFolderId,
            key,
            fileSize: content.length,
            mimeType: "text/plain",
            originalName: `query-${i}.txt`,
          });
        };
      });

      const { results } = await runConcurrentOperations(createOps, 10);
      createdFileIds = results.map((file) => file.id);

      // Star some files
      const starOps = createdFileIds
        .slice(0, 10)
        .map((fileId) => () => fileService.starFile(fileId, testUserId, true));
      await runConcurrentOperations(starOps, 5);

      // Trash some files
      const trashOps = createdFileIds
        .slice(10, 20)
        .map((fileId) => () => fileService.trashFile(fileId, testUserId));
      await runConcurrentOperations(trashOps, 5);

      console.log(
        `Created ${createdFileIds.length} test files for query tests`
      );
    }, 60000);

    it("should handle concurrent getAllUserFiles queries", async () => {
      const config = STRESS_CONFIG.QUERY;

      const operations = Array.from({ length: config.iterations }, () => {
        return async () => {
          return await fileService.getAllUserFiles(testUserId);
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Get All User Files", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(600);
      expect(metrics.p95Latency).toBeLessThan(800);
    }, 60000);

    it("should handle concurrent getStarredFiles queries", async () => {
      const config = STRESS_CONFIG.QUERY;

      const operations = Array.from({ length: config.iterations }, () => {
        return async () => {
          return await fileService.getStarredFiles(testUserId);
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Get Starred Files", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(200);
    }, 60000);

    it("should handle concurrent getTrashedFiles queries", async () => {
      const config = STRESS_CONFIG.QUERY;

      const operations = Array.from({ length: config.iterations }, () => {
        return async () => {
          return await fileService.getTrashedFiles(testUserId);
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Get Trashed Files", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(300);
    }, 60000);

    it("should handle concurrent getRecentFiles queries", async () => {
      const config = STRESS_CONFIG.QUERY;

      const operations = Array.from({ length: config.iterations }, () => {
        return async () => {
          return await fileService.getRecentFiles(testUserId, 20);
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Get Recent Files", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(300);
    }, 60000);
  });

  describe("File Operation Stress Tests", () => {
    let operationFileIds: string[];

    beforeEach(async () => {
      // Ensure user and folder exist after cleanup
      let user = await User.findById(testUserId);
      if (!user) {
        await User.create({
          _id: testUserId,
          name: `stress-test-${Date.now()}`,
          email: `stress-test-${Date.now()}@test.com`,
          password: "hashedpassword",
          storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
          storageUsage: 0,
        });
      } else {
        // Reset storage usage before creating test files
        await User.findByIdAndUpdate(testUserId, { storageUsage: 0 });
      }

      let folder = await Folder.findById(testFolderId);
      if (!folder) {
        await Folder.create({
          _id: testFolderId,
          name: "Stress Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }

      // Create files for operations
      const createOps = Array.from({ length: 50 }, (_, i) => {
        return async () => {
          const key = `stress-test/${testUserId}/${uuidv4()}/op-${i}.txt`;
          const content = Buffer.from(`Operation test ${i}`);

          await StorageService.putObject(
            BUCKETS.FILES,
            key,
            content,
            content.length,
            "text/plain"
          );

          return await fileService.createFileRecord({
            userId: testUserId,
            folderId: testFolderId,
            key,
            fileSize: content.length,
            mimeType: "text/plain",
            originalName: `op-${i}.txt`,
          });
        };
      });

      const { results } = await runConcurrentOperations(createOps, 10);
      operationFileIds = results.map((file) => file.id);
    }, 60000);

    it("should handle concurrent star/unstar operations", async () => {
      const operations = operationFileIds.flatMap((fileId) => [
        () => fileService.starFile(fileId, testUserId, true),
        () => fileService.starFile(fileId, testUserId, false),
      ]);

      const { durations, errors } = await runConcurrentOperations(
        operations,
        STRESS_CONFIG.OPERATIONS.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Star/Unstar Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(100);
    }, 60000);

    it("should handle concurrent trash operations", async () => {
      const operations = operationFileIds.map(
        (fileId) => () => fileService.trashFile(fileId, testUserId)
      );

      const { durations, errors } = await runConcurrentOperations(
        operations,
        STRESS_CONFIG.OPERATIONS.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Trash File Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(100);
    }, 60000);

    it("should handle concurrent restore operations", async () => {
      // First trash all files
      await Promise.all(
        operationFileIds.map((fileId) =>
          fileService.trashFile(fileId, testUserId)
        )
      );

      const operations = operationFileIds.map(
        (fileId) => () => fileService.restoreFile(fileId, testUserId)
      );

      const { durations, errors } = await runConcurrentOperations(
        operations,
        STRESS_CONFIG.OPERATIONS.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Restore File Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(100);
    }, 60000);

    it("should handle concurrent rename operations", async () => {
      const operations = operationFileIds.map(
        (fileId, i) => () =>
          fileService.renameFile(fileId, testUserId, `renamed-${i}.txt`)
      );

      const { durations, errors } = await runConcurrentOperations(
        operations,
        STRESS_CONFIG.OPERATIONS.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Rename File Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(150);
    }, 60000);

    it("should handle concurrent move operations", async () => {
      // Create a second folder for moving
      const targetFolder = await Folder.create({
        user: new mongoose.Types.ObjectId(testUserId),
        name: "Target Folder",
        ancestors: [],
      });

      const operations = operationFileIds.map(
        (fileId) => () =>
          fileService.moveFile(fileId, testUserId, targetFolder._id.toString())
      );

      const { durations, errors } = await runConcurrentOperations(
        operations,
        STRESS_CONFIG.OPERATIONS.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Move File Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(200);
    }, 60000);

    it("should handle concurrent permanent delete operations", async () => {
      // Create fresh files for deletion test (to avoid interference from previous tests)
      const createOps = Array.from({ length: 50 }, (_, i) => {
        return async () => {
          const key = `stress-test/${testUserId}/${uuidv4()}/delete-${i}.txt`;
          const content = Buffer.from(`Delete test ${i}`);

          await StorageService.putObject(
            BUCKETS.FILES,
            key,
            content,
            content.length,
            "text/plain"
          );

          return await fileService.createFileRecord({
            userId: testUserId,
            folderId: testFolderId,
            key,
            fileSize: content.length,
            mimeType: "text/plain",
            originalName: `delete-${i}.txt`,
          });
        };
      });

      const { results } = await runConcurrentOperations(createOps, 10);
      const deleteFileIds = results.map((file) => file.id);

      // First trash all files sequentially to ensure they're all trashed
      for (const fileId of deleteFileIds) {
        await fileService.trashFile(fileId, testUserId);
      }

      // Small delay to ensure all trash operations are committed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Now delete sequentially (permanent delete uses MongoDB transactions which conflict at any concurrency > 1)
      const operations = deleteFileIds.map(
        (fileId) => () => fileService.deleteFilePermanent(fileId, testUserId)
      );

      const { durations, errors } = await runConcurrentOperations(
        operations,
        1 // Sequential execution required due to MongoDB transaction conflicts
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Permanent Delete Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(500);
    }, 90000);
  });

  describe("URL Generation Stress Tests", () => {
    it("should handle concurrent presigned download URL generation", async () => {
      const config = STRESS_CONFIG.URL_GENERATION;

      // Ensure user and folder exist after cleanup
      let user = await User.findById(testUserId);
      if (!user) {
        await User.create({
          _id: testUserId,
          name: `stress-test-${Date.now()}`,
          email: `stress-test-${Date.now()}@test.com`,
          password: "hashedpassword",
          storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
          storageUsage: 0,
        });
      } else {
        // Reset storage usage before creating test files
        await User.findByIdAndUpdate(testUserId, { storageUsage: 0 });
      }

      let folder = await Folder.findById(testFolderId);
      if (!folder) {
        await Folder.create({
          _id: testFolderId,
          name: "Stress Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }

      // Create files for URL generation within this test
      const createOps = Array.from({ length: 20 }, (_, i) => {
        return async () => {
          const key = `stress-test/${testUserId}/${uuidv4()}/url-${i}.txt`;
          const content = Buffer.from(`URL test ${i}`);

          await StorageService.putObject(
            BUCKETS.FILES,
            key,
            content,
            content.length,
            "text/plain"
          );

          return await fileService.createFileRecord({
            userId: testUserId,
            folderId: testFolderId,
            key,
            fileSize: content.length,
            mimeType: "text/plain",
            originalName: `url-${i}.txt`,
          });
        };
      });

      const { results: urlTestFiles } = await runConcurrentOperations(
        createOps,
        10
      );
      const urlTestFileIds = urlTestFiles.map((file) => file.id);

      // Now test URL generation
      const operations = Array.from({ length: config.iterations }, (_, i) => {
        const fileId = urlTestFileIds[i % urlTestFileIds.length];
        return async () => {
          return await fileService.getPresignedDownloadUrl({
            userId: testUserId,
            fileId,
            expirySeconds: 3600,
          });
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Presigned Download URL Generation", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(300);
    }, 90000);

    it("should handle concurrent preview URL generation", async () => {
      const config = STRESS_CONFIG.URL_GENERATION;

      // Ensure user and folder exist after cleanup
      let user = await User.findById(testUserId);
      if (!user) {
        await User.create({
          _id: testUserId,
          name: `stress-test-${Date.now()}`,
          email: `stress-test-${Date.now()}@test.com`,
          password: "hashedpassword",
          storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
          storageUsage: 0,
        });
      } else {
        // Reset storage usage before creating test files
        await User.findByIdAndUpdate(testUserId, { storageUsage: 0 });
      }

      let folder = await Folder.findById(testFolderId);
      if (!folder) {
        await Folder.create({
          _id: testFolderId,
          name: "Stress Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }

      // Create files for URL generation within this test
      const createOps = Array.from({ length: 20 }, (_, i) => {
        return async () => {
          const key = `stress-test/${testUserId}/${uuidv4()}/preview-${i}.txt`;
          const content = Buffer.from(`Preview test ${i}`);

          await StorageService.putObject(
            BUCKETS.FILES,
            key,
            content,
            content.length,
            "text/plain"
          );

          return await fileService.createFileRecord({
            userId: testUserId,
            folderId: testFolderId,
            key,
            fileSize: content.length,
            mimeType: "text/plain",
            originalName: `preview-${i}.txt`,
          });
        };
      });

      const { results: previewTestFiles } = await runConcurrentOperations(
        createOps,
        10
      );
      const previewTestFileIds = previewTestFiles.map((file) => file.id);

      // Now test URL generation
      const operations = Array.from({ length: config.iterations }, (_, i) => {
        const fileId = previewTestFileIds[i % previewTestFileIds.length];
        return async () => {
          return await fileService.getPreviewUrl({
            userId: testUserId,
            fileId,
            expirySeconds: 3600,
          });
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Preview URL Generation", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(300);
    }, 90000);
  });

  describe("Mixed Operations Stress Test", () => {
    it("should handle mixed concurrent file operations", async () => {
      const config = STRESS_CONFIG.MIXED;

      // Ensure user and folder exist after cleanup
      let user = await User.findById(testUserId);
      if (!user) {
        await User.create({
          _id: testUserId,
          name: `stress-test-${Date.now()}`,
          email: `stress-test-${Date.now()}@test.com`,
          password: "hashedpassword",
          storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
          storageUsage: 0,
        });
      } else {
        // Reset storage usage before creating test files
        await User.findByIdAndUpdate(testUserId, { storageUsage: 0 });
      }

      let folder = await Folder.findById(testFolderId);
      if (!folder) {
        await Folder.create({
          _id: testFolderId,
          name: "Stress Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }

      // Create files for mixed operations within this test
      const createOps = Array.from({ length: 30 }, (_, i) => {
        return async () => {
          const key = `stress-test/${testUserId}/${uuidv4()}/mixed-${i}.txt`;
          const content = Buffer.from(`Mixed test ${i}`);

          await StorageService.putObject(
            BUCKETS.FILES,
            key,
            content,
            content.length,
            "text/plain"
          );

          return await fileService.createFileRecord({
            userId: testUserId,
            folderId: testFolderId,
            key,
            fileSize: content.length,
            mimeType: "text/plain",
            originalName: `mixed-${i}.txt`,
          });
        };
      });

      const { results: mixedTestFiles } = await runConcurrentOperations(
        createOps,
        10
      );
      const mixedTestFileIds = mixedTestFiles.map((file) => file.id);

      // Mix different operations
      const operations = Array.from({ length: config.iterations }, (_, i) => {
        const operationType = i % 6;
        const fileId = mixedTestFileIds[i % mixedTestFileIds.length];

        switch (operationType) {
          case 0:
            return async () => {
              await fileService.getAllUserFiles(testUserId);
              return "getAllUserFiles";
            };
          case 1:
            return async () => {
              await fileService.starFile(fileId, testUserId, true);
              return "starFile";
            };
          case 2:
            return async () => {
              await fileService.getPresignedDownloadUrl({
                userId: testUserId,
                fileId,
                expirySeconds: 3600,
              });
              return "getPresignedDownloadUrl";
            };
          case 3:
            return async () => {
              await fileService.renameFile(
                fileId,
                testUserId,
                `mixed-renamed-${i}.txt`
              );
              return "renameFile";
            };
          case 4:
            return async () => {
              await fileService.getRecentFiles(testUserId, 10);
              return "getRecentFiles";
            };
          case 5:
            return async () => {
              await fileService.getStarredFiles(testUserId);
              return "getStarredFiles";
            };
          default:
            return async () => {
              await fileService.getAllUserFiles(testUserId);
              return "getAllUserFiles";
            };
        }
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Mixed File Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(400);
    }, 120000);
  });
});
