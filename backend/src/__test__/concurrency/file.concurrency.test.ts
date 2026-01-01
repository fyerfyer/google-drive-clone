import Folder, { IFolder } from "../../models/Folder.model";
import File from "../../models/File.model";
import User, { IUser } from "../../models/User.model";
import { FileService } from "../../services/file.service";
import { uploadTestFile } from "../utils/file.util";
import { v4 as uuidv4 } from "uuid";

describe("File Concurrency Tests", () => {
  let fileService: FileService;
  let mockUser: IUser;
  let parentFolder: IFolder;

  beforeEach(async () => {
    fileService = new FileService();

    mockUser = await User.create({
      name: "testuser",
      email: `test-${uuidv4()}@example.com`,
      password: "hashedpassword",
      storageUsage: 0,
      storageQuota: 1024 * 1024 * 1024, // 1GB
    });

    parentFolder = await Folder.create({
      name: "TestFolder",
      user: mockUser._id,
      parent: null,
      ancestors: [],
      isTrashed: false,
    });
  });

  describe("Concurrent File Uploads", () => {
    it("should handle multiple concurrent file uploads to same folder", async () => {
      const uploadPromises = Array.from({ length: 10 }, (_, i) =>
        uploadTestFile(
          fileService,
          String(mockUser._id),
          String(parentFolder._id),
          `file-${i}.txt`,
          `content-${i}`
        )
      );

      const results = await Promise.all(uploadPromises);

      expect(results).toHaveLength(10);
      results.forEach((file, i) => {
        expect(file.name).toBe(`file-${i}.txt`);
        expect(file.user.id).toBe(String(mockUser._id));
      });

      // Verify all files were created in database
      const filesInDb = await File.find({ folder: parentFolder._id });
      expect(filesInDb).toHaveLength(10);
    });

    it("should handle concurrent uploads with duplicate content (deduplication)", async () => {
      const sharedHash = "shared-content-hash";
      const sharedContent = "duplicate content";

      // Upload files concurrently with same hash
      const uploadPromises = Array.from({ length: 5 }, (_, i) =>
        uploadTestFile(
          fileService,
          String(mockUser._id),
          String(parentFolder._id),
          `duplicate-${i}.txt`,
          sharedContent,
          sharedHash
        )
      );

      const results = await Promise.all(uploadPromises);

      expect(results).toHaveLength(5);

      // All files should share the same underlying storage key
      const filesInDb = await File.find({
        folder: parentFolder._id,
      }).select("+hash +key");

      expect(filesInDb).toHaveLength(5);

      // All should have same hash
      filesInDb.forEach((file) => {
        expect(file.hash).toBe(sharedHash);
      });
    });

    it("should enforce storage quota during concurrent uploads", async () => {
      // Set very low quota
      await User.findByIdAndUpdate(mockUser._id, {
        storageQuota: 1000, // 1KB
      });

      const largeContent = "x".repeat(300); // 300 bytes each

      const uploadPromises = Array.from({ length: 5 }, (_, i) =>
        uploadTestFile(
          fileService,
          String(mockUser._id),
          String(parentFolder._id),
          `large-${i}.txt`,
          largeContent
        ).catch((err) => err)
      );

      const results = await Promise.all(uploadPromises);

      // Some should succeed, some should fail due to quota
      const succeeded = results.filter((r) => r && r.id);
      const failed = results.filter((r) => r instanceof Error);

      expect(succeeded.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);

      // Verify storage usage is accurate
      const updatedUser = await User.findById(mockUser._id);
      expect(updatedUser?.storageUsage).toBeLessThanOrEqual(
        updatedUser!.storageQuota
      );
    });
  });

  describe("Concurrent File Operations", () => {
    it("should handle concurrent file renames", async () => {
      const file = await uploadTestFile(
        fileService,
        String(mockUser._id),
        String(parentFolder._id),
        "original.txt",
        "test content"
      );

      const renamePromises = Array.from({ length: 5 }, (_, i) =>
        fileService
          .renameFile(file.id, String(100), `renamed-${i}.txt`)
          .catch((err) => err)
      );

      const results = await Promise.all(renamePromises);

      // One or more should succeed; a successful rename resolves to undefined
      // (service methods don't return a value), so treat any non-Error
      // result as success.

      const succeeded = results.filter((r) => !(r instanceof Error));
      expect(succeeded.length).toBeGreaterThan(0);

      // Final state should be consistent
      const finalFile = await File.findById(file.id);
      expect(finalFile?.name).toMatch(/renamed-\d+\.txt/);
    });

    it("should handle concurrent star/unstar operations", async () => {
      const file = await uploadTestFile(
        fileService,
        String(mockUser._id),
        String(parentFolder._id),
        "star-test.txt",
        "test content"
      );

      // Concurrent star/unstar operations
      const operations = Array.from({ length: 20 }, (_, i) =>
        fileService.starFile(
          file.id,
          String(mockUser._id),
          i % 2 === 0 // Alternate between star and unstar
        )
      );

      await Promise.all(operations);

      // Final state should be consistent
      const finalFile = await File.findById(file.id);
      expect(typeof finalFile?.isStarred).toBe("boolean");
    });

    it("should handle concurrent delete operations", async () => {
      const file = await uploadTestFile(
        fileService,
        String(mockUser._id),
        String(parentFolder._id),
        "delete-test.txt",
        "test content"
      );

      // Move to trash first
      await File.findByIdAndUpdate(file.id, { isTrashed: true });

      // Multiple concurrent delete attempts
      const deletePromises = Array.from({ length: 5 }, () =>
        fileService
          .deleteFilePermanent(file.id, String(mockUser._id))
          .catch((err) => err)
      );

      const results = await Promise.all(deletePromises);

      for (const result of results) {
        console.log(`Type of result: ${typeof result}`);
      }

      // At least one should succeed
      const succeeded = results.filter(
        (r) => !(r instanceof Error || r === undefined)
      );
      expect(succeeded.length).toBeGreaterThan(0);

      // File should be deleted or not found
      const finalFile = await File.findById(file.id);
      expect(finalFile).toBeNull();
    });
  });

  describe("Concurrent File Moving", () => {
    it("should handle concurrent file moves between folders", async () => {
      const folder1 = await Folder.create({
        name: "Folder1",
        user: mockUser._id,
        parent: parentFolder._id,
        ancestors: [parentFolder._id],
        isTrashed: false,
      });

      const folder2 = await Folder.create({
        name: "Folder2",
        user: mockUser._id,
        parent: parentFolder._id,
        ancestors: [parentFolder._id],
        isTrashed: false,
      });

      // Create multiple files
      const files = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          uploadTestFile(
            fileService,
            String(mockUser._id),
            String(parentFolder._id),
            `file-${i}.txt`,
            `content-${i}`
          )
        )
      );

      // Move all files concurrently to different folders
      const movePromises = files.map((file, i) =>
        fileService.moveFile(
          file.id,
          String(mockUser._id),
          i % 2 === 0 ? String(folder1._id) : String(folder2._id)
        )
      );

      const results = await Promise.all(movePromises);

      expect(results).toHaveLength(5);

      // Verify files are in correct folders
      const folder1Files = await File.find({ folder: folder1._id });
      const folder2Files = await File.find({ folder: folder2._id });

      expect(folder1Files.length).toBe(3);
      expect(folder2Files.length).toBe(2);
    });

    it("should handle race condition when moving same file to different destinations", async () => {
      const file = await uploadTestFile(
        fileService,
        String(mockUser._id),
        String(parentFolder._id),
        "race-test.txt",
        "test content"
      );

      const folders = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          Folder.create({
            name: `Destination-${i}`,
            user: mockUser._id,
            parent: parentFolder._id,
            ancestors: [parentFolder._id],
            isTrashed: false,
          })
        )
      );

      // Try to move the same file to different folders concurrently
      const movePromises = folders.map((folder) =>
        fileService
          .moveFile(file.id, String(mockUser._id), String(folder._id))
          .catch((err) => err)
      );

      const results = await Promise.all(movePromises);

      // At least one should succeed
      const succeeded = results.filter((r) => !(r instanceof Error));
      expect(succeeded.length).toBeGreaterThan(0);

      // File should end up in exactly one folder
      const finalFile = await File.findById(file.id);
      expect(finalFile?.folder).toBeDefined();
      expect(folders.some((f) => f._id.equals(finalFile!.folder!))).toBe(true);
    });
  });

  describe("Concurrent Access and Updates", () => {
    it("should handle concurrent reads and writes", async () => {
      const file = await uploadTestFile(
        fileService,
        String(mockUser._id),
        String(parentFolder._id),
        "concurrent-access.txt",
        "initial content"
      );

      // Mix of read and write operations
      const operations = [
        ...Array.from({ length: 10 }, () => File.findById(file.id)),
        ...Array.from({ length: 5 }, (_, i) =>
          fileService
            .renameFile(file.id, String(mockUser._id), `updated-${i}.txt`)
            .catch((err) => err)
        ),
      ];

      const results = await Promise.all(operations);

      // All read operations should succeed
      const reads = results.slice(0, 10);
      reads.forEach((result) => {
        expect(result).toBeDefined();
        expect(result!._id.toString()).toBe(file.id);
      });

      // Final state should be consistent
      const finalFile = await File.findById(file.id);
      expect(finalFile).toBeDefined();
    });

    it("should maintain referential integrity during concurrent operations", async () => {
      // Create files with references
      const files = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          uploadTestFile(
            fileService,
            String(mockUser._id),
            String(parentFolder._id),
            `ref-file-${i}.txt`,
            `content-${i}`
          )
        )
      );

      // Mark files as trashed first
      await Promise.all(
        files
          .slice(0, 2)
          .map((f) => File.findByIdAndUpdate(f.id, { isTrashed: true }))
      );

      // Perform various concurrent operations
      const operations = [
        ...files
          .slice(0, 2)
          .map((f) =>
            fileService.deleteFilePermanent(f.id, String(mockUser._id))
          ),
        ...files
          .slice(2, 4)
          .map((f) => fileService.starFile(f.id, String(mockUser._id), true)),
        File.findById(files[4].id),
      ];

      await Promise.all(operations.map((p) => p.catch((err) => err)));

      // Verify database consistency
      const remainingFiles = await File.find({
        folder: parentFolder._id,
        user: mockUser._id,
      });

      // Should have at least the 3 non-deleted files
      expect(remainingFiles.length).toBeGreaterThanOrEqual(3);

      // All files should have valid user references
      remainingFiles.forEach((file) => {
        expect(file.user.equals(mockUser._id)).toBe(true);
        expect(file.folder?.equals(parentFolder._id)).toBe(true);
      });
    });
  });

  describe("Storage Consistency Under Concurrency", () => {
    it("should maintain storage usage accuracy during concurrent uploads and deletes", async () => {
      const initialUser = await User.findById(mockUser._id);
      const initialUsage = initialUser!.storageUsage;

      // Create files
      const files = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          uploadTestFile(
            fileService,
            String(mockUser._id),
            String(parentFolder._id),
            `storage-${i}.txt`,
            "x".repeat(100) // 100 bytes each
          )
        )
      );

      // Mark files as trashed first
      await Promise.all(
        files
          .slice(0, 3)
          .map((f) => File.findByIdAndUpdate(f.id, { isTrashed: true }))
      );

      // Concurrent deletes and uploads
      const operations = [
        ...files
          .slice(0, 3)
          .map((f) =>
            fileService.deleteFilePermanent(f.id, String(mockUser._id))
          ),
        ...Array.from({ length: 3 }, (_, i) =>
          uploadTestFile(
            fileService,
            String(mockUser._id),
            String(parentFolder._id),
            `new-${i}.txt`,
            "y".repeat(100)
          )
        ),
      ];

      await Promise.all(operations.map((p) => p.catch((err) => err)));

      // Wait a bit for all operations to settle
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify storage usage
      const finalUser = await User.findById(mockUser._id);
      const actualFiles = await File.find({ user: mockUser._id });
      const expectedUsage = actualFiles.reduce(
        (sum, file) => sum + file.size,
        0
      );

      expect(finalUser!.storageUsage).toBe(expectedUsage);
    }, 10000);
  });
});
