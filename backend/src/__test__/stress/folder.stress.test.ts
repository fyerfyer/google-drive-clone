import { v4 as uuidv4 } from "uuid";
import { FolderService } from "../../services/folder.service";
import { FileService } from "../../services/file.service";
import { StorageService } from "../../services/storage.service";
import { BUCKETS } from "../../config/s3";
import { performance } from "perf_hooks";
import User from "../../models/User.model";
import Folder from "../../models/Folder.model";
import File from "../../models/File.model";
import mongoose from "mongoose";

describe("Folder Service Stress Tests", () => {
  const folderService = new FolderService();
  const fileService = new FileService();
  let testUserId: string;
  let rootFolderId: string;

  // Test configuration
  const STRESS_CONFIG = {
    // Flat folder creation stress test
    FLAT_FOLDER_CREATE: {
      iterations: 100,
      concurrent: 30,
    },
    // Nested folder creation stress test (3 levels deep)
    NESTED_FOLDER_CREATE: {
      iterations: 50,
      concurrent: 15,
      depth: 3,
    },
    // Deep nested folder creation (5 levels deep)
    DEEP_NESTED_FOLDER_CREATE: {
      iterations: 20,
      concurrent: 5,
      depth: 5,
    },
    // Folder query stress test
    QUERY: {
      iterations: 200,
      concurrent: 50,
    },
    // Folder operation stress test (trash, restore, star, etc.)
    OPERATIONS: {
      iterations: 150,
      concurrent: 30,
    },
    // Folder move stress test
    MOVE: {
      iterations: 100,
      concurrent: 20,
    },
    // Folder content loading (with files and subfolders)
    CONTENT_LOADING: {
      iterations: 150,
      concurrent: 30,
      filesPerFolder: 10,
      subfoldersPerFolder: 5,
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
      email: `stress-test-folder-${uuidv4()}@example.com`,
      password: "testpassword123",
      name: "Folder Stress Test User",
      storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
      storageUsage: 0,
    });
    testUserId = testUser._id.toString();

    // Create root test folder
    const rootFolder = await Folder.create({
      user: new mongoose.Types.ObjectId(testUserId),
      name: "Root Test Folder",
      ancestors: [],
    });
    rootFolderId = rootFolder._id.toString();

    console.log(`Test user created: ${testUserId}`);
    console.log(`Root folder created: ${rootFolderId}`);
  }, 30000);

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
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
      await Folder.deleteMany({
        user: new mongoose.Types.ObjectId(testUserId),
      });
      await User.findByIdAndDelete(testUserId);

      console.log("Test cleanup completed");
    }
  }, 60000);

  describe("Folder Creation Stress Tests", () => {
    beforeEach(async () => {
      // Recreate user and root folder before each test (afterEach in setup.ts deletes everything)
      let user = await User.findById(testUserId);
      if (!user) {
        await User.create({
          _id: testUserId,
          email: `stress-test-folder-${uuidv4()}@example.com`,
          password: "testpassword123",
          name: "Folder Stress Test User",
          storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
          storageUsage: 0,
        });
      } else {
        await User.findByIdAndUpdate(testUserId, { storageUsage: 0 });
      }

      let folder = await Folder.findById(rootFolderId);
      if (!folder) {
        await Folder.create({
          _id: rootFolderId,
          name: "Root Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }
    });

    describe("Flat Folder Creation", () => {
      it(`should handle ${STRESS_CONFIG.FLAT_FOLDER_CREATE.iterations} flat folder creations with concurrency ${STRESS_CONFIG.FLAT_FOLDER_CREATE.concurrent}`, async () => {
        const config = STRESS_CONFIG.FLAT_FOLDER_CREATE;

        const operations = Array.from({ length: config.iterations }, (_, i) => {
          return async () => {
            return await folderService.createFolder({
              userId: testUserId,
              name: `Flat Folder ${i}`,
              parentId: rootFolderId,
            });
          };
        });

        const { results, durations, errors } = await runConcurrentOperations(
          operations,
          config.concurrent
        );

        const metrics = calculateMetrics(durations, errors);
        printMetrics("Flat Folder Creation", metrics);

        // Assertions
        expect(metrics.failureCount).toBe(0);
        expect(results.length).toBe(config.iterations);
        expect(metrics.avgLatency).toBeLessThan(200);
        expect(metrics.p95Latency).toBeLessThan(400);
      }, 120000);
    });

    describe("Nested Folder Creation", () => {
      it(`should handle ${STRESS_CONFIG.NESTED_FOLDER_CREATE.iterations} nested folder creations (${STRESS_CONFIG.NESTED_FOLDER_CREATE.depth} levels) with concurrency ${STRESS_CONFIG.NESTED_FOLDER_CREATE.concurrent}`, async () => {
        const config = STRESS_CONFIG.NESTED_FOLDER_CREATE;

        const operations = Array.from({ length: config.iterations }, (_, i) => {
          return async () => {
            let parentId = rootFolderId;
            const folderIds: string[] = [];

            // Create nested structure
            for (let depth = 0; depth < config.depth; depth++) {
              const folder = await folderService.createFolder({
                userId: testUserId,
                name: `Nested-${i}-Level-${depth}`,
                parentId: parentId,
              });
              folderIds.push(folder.id);
              parentId = folder.id;
            }

            return folderIds;
          };
        });

        const { results, durations, errors } = await runConcurrentOperations(
          operations,
          config.concurrent
        );

        const metrics = calculateMetrics(durations, errors);
        printMetrics("Nested Folder Creation", metrics);

        // Assertions
        expect(metrics.failureCount).toBe(0);
        expect(results.length).toBe(config.iterations);
        expect(metrics.avgLatency).toBeLessThan(600);
        expect(metrics.p95Latency).toBeLessThan(1200);
      }, 120000);
    });

    describe("Deep Nested Folder Creation", () => {
      it(`should handle ${STRESS_CONFIG.DEEP_NESTED_FOLDER_CREATE.iterations} deep nested folder creations (${STRESS_CONFIG.DEEP_NESTED_FOLDER_CREATE.depth} levels) with concurrency ${STRESS_CONFIG.DEEP_NESTED_FOLDER_CREATE.concurrent}`, async () => {
        const config = STRESS_CONFIG.DEEP_NESTED_FOLDER_CREATE;

        const operations = Array.from({ length: config.iterations }, (_, i) => {
          return async () => {
            let parentId = rootFolderId;
            const folderIds: string[] = [];

            // Create deep nested structure
            for (let depth = 0; depth < config.depth; depth++) {
              const folder = await folderService.createFolder({
                userId: testUserId,
                name: `Deep-${i}-Level-${depth}`,
                parentId: parentId,
              });
              folderIds.push(folder.id);
              parentId = folder.id;
            }

            return folderIds;
          };
        });

        const { results, durations, errors } = await runConcurrentOperations(
          operations,
          config.concurrent
        );

        const metrics = calculateMetrics(durations, errors);
        printMetrics("Deep Nested Folder Creation", metrics);

        // Assertions
        expect(metrics.failureCount).toBe(0);
        expect(results.length).toBe(config.iterations);
        expect(metrics.avgLatency).toBeLessThan(1000);
        expect(metrics.p95Latency).toBeLessThan(2000);
      }, 150000);
    });
  });

  describe("Folder Query Stress Tests", () => {
    let testFolders: string[] = [];

    beforeEach(async () => {
      // Recreate user and root folder
      let user = await User.findById(testUserId);
      if (!user) {
        await User.create({
          _id: testUserId,
          email: `stress-test-folder-${uuidv4()}@example.com`,
          password: "testpassword123",
          name: "Folder Stress Test User",
          storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
          storageUsage: 0,
        });
      }

      let folder = await Folder.findById(rootFolderId);
      if (!folder) {
        await Folder.create({
          _id: rootFolderId,
          name: "Root Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }

      // Create test folders for query operations
      const createOps = Array.from({ length: 50 }, (_, i) => {
        return async () => {
          const folder = await folderService.createFolder({
            userId: testUserId,
            name: `Query Test Folder ${i}`,
            parentId: rootFolderId,
          });
          return folder.id;
        };
      });

      const { results } = await runConcurrentOperations(createOps, 10);
      testFolders = results;

      // Star some folders
      await Promise.all(
        testFolders
          .slice(0, 10)
          .map((id) => folderService.starFolder(id, testUserId, true))
      );
    }, 60000);

    it("should handle concurrent folder content retrieval", async () => {
      const config = STRESS_CONFIG.QUERY;

      const operations = Array.from({ length: config.iterations }, (_, i) => {
        const folderId = testFolders[i % testFolders.length];
        return async () => {
          return await folderService.getFolderContent(folderId, testUserId);
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Folder Content Retrieval", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(500);
      expect(metrics.p95Latency).toBeLessThan(700);
    }, 90000);

    it("should handle concurrent starred folders retrieval", async () => {
      const config = STRESS_CONFIG.QUERY;

      const operations = Array.from({ length: config.iterations }, () => {
        return async () => {
          return await folderService.getStarredFolders(testUserId);
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Starred Folders Retrieval", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(150);
      expect(metrics.p95Latency).toBeLessThan(300);
    }, 90000);

    it("should handle concurrent recent folders retrieval", async () => {
      const config = STRESS_CONFIG.QUERY;

      const operations = Array.from({ length: config.iterations }, () => {
        return async () => {
          return await folderService.getRecentFolders(testUserId, 20);
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Recent Folders Retrieval", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(200);
      expect(metrics.p95Latency).toBeLessThan(350);
    }, 90000);

    it("should handle concurrent folder path retrieval", async () => {
      const config = STRESS_CONFIG.QUERY;

      const operations = Array.from({ length: config.iterations }, (_, i) => {
        const folderId = testFolders[i % testFolders.length];
        return async () => {
          return await folderService.getFolderPath(folderId, testUserId);
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Folder Path Retrieval", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(200);
      expect(metrics.p95Latency).toBeLessThan(400);
    }, 90000);
  });

  describe("Folder Operations Stress Tests", () => {
    let operationTestFolders: string[] = [];

    beforeEach(async () => {
      // Recreate user and root folder
      let user = await User.findById(testUserId);
      if (!user) {
        await User.create({
          _id: testUserId,
          email: `stress-test-folder-${uuidv4()}@example.com`,
          password: "testpassword123",
          name: "Folder Stress Test User",
          storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
          storageUsage: 0,
        });
      }

      let folder = await Folder.findById(rootFolderId);
      if (!folder) {
        await Folder.create({
          _id: rootFolderId,
          name: "Root Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }

      // Create fresh test folders for each operation test
      const createOps = Array.from({ length: 30 }, (_, i) => {
        return async () => {
          const folder = await folderService.createFolder({
            userId: testUserId,
            name: `Operation Test Folder ${i}-${Date.now()}`,
            parentId: rootFolderId,
          });
          return folder.id;
        };
      });

      const { results } = await runConcurrentOperations(createOps, 10);
      operationTestFolders = results;
    });

    it("should handle concurrent folder star operations", async () => {
      const config = STRESS_CONFIG.OPERATIONS;

      const operations = Array.from({ length: config.iterations }, (_, i) => {
        const folderId = operationTestFolders[i % operationTestFolders.length];
        const star = i % 2 === 0;
        return async () => {
          await folderService.starFolder(folderId, testUserId, star);
          return "starFolder";
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Folder Star Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(150);
      expect(metrics.p95Latency).toBeLessThan(300);
    }, 90000);

    it("should handle concurrent folder rename operations", async () => {
      const config = STRESS_CONFIG.OPERATIONS;

      const operations = Array.from({ length: config.iterations }, (_, i) => {
        const folderId = operationTestFolders[i % operationTestFolders.length];
        return async () => {
          await folderService.renameFolder(
            folderId,
            testUserId,
            `Renamed-${i}`
          );
          return "renameFolder";
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Folder Rename Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(150);
      expect(metrics.p95Latency).toBeLessThan(300);
    }, 90000);

    it("should handle concurrent folder trash operations", async () => {
      const config = STRESS_CONFIG.OPERATIONS;

      // Create folders specifically for trashing
      const trashOps = Array.from({ length: config.iterations }, (_, i) => {
        return async () => {
          const folder = await folderService.createFolder({
            userId: testUserId,
            name: `To Trash ${i}`,
            parentId: rootFolderId,
          });
          return folder.id;
        };
      });

      const { results: trashFolderIds } = await runConcurrentOperations(
        trashOps,
        20
      );

      // Now trash them concurrently
      const operations = trashFolderIds.map((folderId) => {
        return async () => {
          await folderService.trashFolder(folderId, testUserId);
          return "trashFolder";
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Folder Trash Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(300);
      expect(metrics.p95Latency).toBeLessThan(600);
    }, 120000);

    it("should handle concurrent folder restore operations", async () => {
      const config = STRESS_CONFIG.OPERATIONS;

      // Create and trash folders for restoring
      const createOps = Array.from({ length: config.iterations }, (_, i) => {
        return async () => {
          const folder = await folderService.createFolder({
            userId: testUserId,
            name: `To Restore ${i}`,
            parentId: rootFolderId,
          });
          await folderService.trashFolder(folder.id, testUserId);
          return folder.id;
        };
      });

      const { results: restoreFolderIds } = await runConcurrentOperations(
        createOps,
        20
      );

      // Small delay to ensure all trash operations are committed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Now restore them concurrently
      const operations = restoreFolderIds.map((folderId) => {
        return async () => {
          await folderService.restoreFolder(folderId, testUserId);
          return "restoreFolder";
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Folder Restore Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(300);
      expect(metrics.p95Latency).toBeLessThan(600);
    }, 120000);
  });

  describe("Folder Move Stress Tests", () => {
    beforeEach(async () => {
      // Recreate user and root folder
      let user = await User.findById(testUserId);
      if (!user) {
        await User.create({
          _id: testUserId,
          email: `stress-test-folder-${uuidv4()}@example.com`,
          password: "testpassword123",
          name: "Folder Stress Test User",
          storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
          storageUsage: 0,
        });
      }

      let folder = await Folder.findById(rootFolderId);
      if (!folder) {
        await Folder.create({
          _id: rootFolderId,
          name: "Root Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }
    });

    it("should handle concurrent folder move operations", async () => {
      const config = STRESS_CONFIG.MOVE;

      // Create source and destination folders
      const [sourceFolders, destFolders] = await Promise.all([
        Promise.all(
          Array.from({ length: config.iterations }, (_, i) =>
            folderService.createFolder({
              userId: testUserId,
              name: `Source ${i}`,
              parentId: rootFolderId,
            })
          )
        ),
        Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            folderService.createFolder({
              userId: testUserId,
              name: `Destination ${i}`,
              parentId: rootFolderId,
            })
          )
        ),
      ]);

      const operations = sourceFolders.map((sourceFolder, i) => {
        const destFolder = destFolders[i % destFolders.length];
        return async () => {
          await folderService.moveFolder({
            folderId: sourceFolder.id,
            destinationId: destFolder.id,
            userId: testUserId,
          });
          return "moveFolder";
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Folder Move Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(400);
      expect(metrics.p95Latency).toBeLessThan(800);
    }, 120000);

    it("should handle moving nested folders with ancestor updates", async () => {
      const config = { iterations: 30, concurrent: 10 };

      // Create nested folder structures
      const nestedStructures = await Promise.all(
        Array.from({ length: config.iterations }, async (_, i) => {
          let parentId = rootFolderId;
          const folderIds: string[] = [];

          // Create 3-level nested structure
          for (let depth = 0; depth < 3; depth++) {
            const folder = await folderService.createFolder({
              userId: testUserId,
              name: `Move-Nested-${i}-L${depth}`,
              parentId: parentId,
            });
            folderIds.push(folder.id);
            parentId = folder.id;
          }

          return { rootId: folderIds[0], allIds: folderIds };
        })
      );

      // Create destination folders
      const destFolders = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          folderService.createFolder({
            userId: testUserId,
            name: `Move-Dest ${i}`,
            parentId: rootFolderId,
          })
        )
      );

      // Move root folders of nested structures
      const operations = nestedStructures.map((structure, i) => {
        const destFolder = destFolders[i % destFolders.length];
        return async () => {
          await folderService.moveFolder({
            folderId: structure.rootId,
            destinationId: destFolder.id,
            userId: testUserId,
          });
          return "moveNestedFolder";
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Nested Folder Move Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(600);
      expect(metrics.p95Latency).toBeLessThan(1200);
    }, 150000);
  });

  describe("Folder Content Loading Stress Tests", () => {
    beforeEach(async () => {
      // Recreate user and root folder
      let user = await User.findById(testUserId);
      if (!user) {
        await User.create({
          _id: testUserId,
          email: `stress-test-folder-${uuidv4()}@example.com`,
          password: "testpassword123",
          name: "Folder Stress Test User",
          storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
          storageUsage: 0,
        });
      }

      let folder = await Folder.findById(rootFolderId);
      if (!folder) {
        await Folder.create({
          _id: rootFolderId,
          name: "Root Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }
    });

    it("should handle loading folders with many files and subfolders", async () => {
      const config = STRESS_CONFIG.CONTENT_LOADING;

      // Create folders with files and subfolders
      const createOps = Array.from({ length: 20 }, (_, i) => {
        return async () => {
          // Create parent folder
          const parentFolder = await folderService.createFolder({
            userId: testUserId,
            name: `Content Parent ${i}`,
            parentId: rootFolderId,
          });

          // Create subfolders
          await Promise.all(
            Array.from({ length: config.subfoldersPerFolder }, (_, j) =>
              folderService.createFolder({
                userId: testUserId,
                name: `Subfolder ${i}-${j}`,
                parentId: parentFolder.id,
              })
            )
          );

          // Create files
          await Promise.all(
            Array.from({ length: config.filesPerFolder }, async (_, j) => {
              const key = `stress-test/${testUserId}/${uuidv4()}/file-${i}-${j}.txt`;
              const content = Buffer.from(`File ${i}-${j}`);

              await StorageService.putObject(
                BUCKETS.FILES,
                key,
                content,
                content.length,
                "text/plain"
              );

              return await fileService.createFileRecord({
                userId: testUserId,
                folderId: parentFolder.id,
                key,
                fileSize: content.length,
                mimeType: "text/plain",
                originalName: `file-${i}-${j}.txt`,
              });
            })
          );

          return parentFolder.id;
        };
      });

      const { results: contentFolderIds } = await runConcurrentOperations(
        createOps,
        5
      );

      // Now test loading folder content
      const operations = Array.from({ length: config.iterations }, (_, i) => {
        const folderId = contentFolderIds[i % contentFolderIds.length];
        return async () => {
          return await folderService.getFolderContent(folderId, testUserId);
        };
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Folder Content Loading (with files & subfolders)", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(400);
      expect(metrics.p95Latency).toBeLessThan(800);
    }, 180000);
  });

  describe("Permanent Delete Stress Tests", () => {
    beforeEach(async () => {
      // Recreate user and root folder
      let user = await User.findById(testUserId);
      if (!user) {
        await User.create({
          _id: testUserId,
          email: `stress-test-folder-${uuidv4()}@example.com`,
          password: "testpassword123",
          name: "Folder Stress Test User",
          storageQuota: 1024 * 1024 * 1024 * 1024, // 1TB
          storageUsage: 0,
        });
      }

      let folder = await Folder.findById(rootFolderId);
      if (!folder) {
        await Folder.create({
          _id: rootFolderId,
          name: "Root Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }
    });

    it("should handle permanent folder deletion with cascading deletes", async () => {
      const config = { iterations: 30, concurrent: 1 }; // Sequential due to transactions

      // Create folders with nested content for deletion
      const deleteOps = Array.from({ length: config.iterations }, (_, i) => {
        return async () => {
          // Create parent folder
          const parentFolder = await folderService.createFolder({
            userId: testUserId,
            name: `To Delete ${i}`,
            parentId: rootFolderId,
          });

          // Create subfolders
          await Promise.all(
            Array.from({ length: 3 }, (_, j) =>
              folderService.createFolder({
                userId: testUserId,
                name: `Delete Sub ${i}-${j}`,
                parentId: parentFolder.id,
              })
            )
          );

          // Create files
          await Promise.all(
            Array.from({ length: 5 }, async (_, j) => {
              const key = `stress-test/${testUserId}/${uuidv4()}/delete-${i}-${j}.txt`;
              const content = Buffer.from(`Delete ${i}-${j}`);

              await StorageService.putObject(
                BUCKETS.FILES,
                key,
                content,
                content.length,
                "text/plain"
              );

              return await fileService.createFileRecord({
                userId: testUserId,
                folderId: parentFolder.id,
                key,
                fileSize: content.length,
                mimeType: "text/plain",
                originalName: `delete-${i}-${j}.txt`,
              });
            })
          );

          // Trash the folder first
          await folderService.trashFolder(parentFolder.id, testUserId);
          return parentFolder.id;
        };
      });

      const { results: deleteFolderIds } = await runConcurrentOperations(
        deleteOps,
        10
      );

      // Small delay to ensure all trash operations are committed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Now delete permanently (sequential due to MongoDB transactions)
      const operations = deleteFolderIds.map(
        (folderId) => () =>
          folderService.deleteFolderPermanent(folderId, testUserId)
      );

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Permanent Folder Delete Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(800);
    }, 180000);
  });

  describe("Mixed Operations Stress Test", () => {
    it("should handle mixed concurrent folder operations", async () => {
      const config = STRESS_CONFIG.MIXED;

      // Ensure user and root folder exist
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
        await User.findByIdAndUpdate(testUserId, { storageUsage: 0 });
      }

      let rootFolder = await Folder.findById(rootFolderId);
      if (!rootFolder) {
        await Folder.create({
          _id: rootFolderId,
          name: "Root Test Folder",
          user: new mongoose.Types.ObjectId(testUserId),
          parent: null,
          ancestors: [],
          isStarred: false,
          isTrashed: false,
        });
      }

      // Create folders for mixed operations
      const createOps = Array.from({ length: 30 }, (_, i) => {
        return async () => {
          const folder = await folderService.createFolder({
            userId: testUserId,
            name: `Mixed Test Folder ${i}`,
            parentId: rootFolderId,
          });
          return folder.id;
        };
      });

      const { results: mixedTestFolderIds } = await runConcurrentOperations(
        createOps,
        10
      );

      // Mix different operations
      const operations = Array.from({ length: config.iterations }, (_, i) => {
        const operationType = i % 6;
        const folderId = mixedTestFolderIds[i % mixedTestFolderIds.length];

        switch (operationType) {
          case 0:
            return async () => {
              await folderService.getFolderContent(folderId, testUserId);
              return "getFolderContent";
            };
          case 1:
            return async () => {
              await folderService.starFolder(folderId, testUserId, true);
              return "starFolder";
            };
          case 2:
            return async () => {
              await folderService.getFolderPath(folderId, testUserId);
              return "getFolderPath";
            };
          case 3:
            return async () => {
              await folderService.renameFolder(
                folderId,
                testUserId,
                `Mixed-Renamed-${i}`
              );
              return "renameFolder";
            };
          case 4:
            return async () => {
              await folderService.getRecentFolders(testUserId, 10);
              return "getRecentFolders";
            };
          case 5:
            return async () => {
              await folderService.getStarredFolders(testUserId);
              return "getStarredFolders";
            };
          default:
            return async () => {
              await folderService.getFolderContent(folderId, testUserId);
              return "getFolderContent";
            };
        }
      });

      const { durations, errors } = await runConcurrentOperations(
        operations,
        config.concurrent
      );

      const metrics = calculateMetrics(durations, errors);
      printMetrics("Mixed Folder Operations", metrics);

      expect(metrics.failureCount).toBe(0);
      expect(metrics.avgLatency).toBeLessThan(400);
    }, 150000);
  });
});
