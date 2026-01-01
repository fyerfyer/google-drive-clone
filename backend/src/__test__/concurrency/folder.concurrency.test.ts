import Folder, { IFolder } from "../../models/Folder.model";
import File from "../../models/File.model";
import User, { IUser } from "../../models/User.model";
import { FolderService, IFolderContent } from "../../services/folder.service";
import { FileService } from "../../services/file.service";
import { uploadTestFile } from "../utils/file.util";
import { v4 as uuidv4 } from "uuid";

describe("Folder Concurrency Tests", () => {
  let folderService: FolderService;
  let fileService: FileService;
  let mockUser: IUser;
  let rootFolder: IFolder;

  beforeEach(async () => {
    folderService = new FolderService();
    fileService = new FileService();

    mockUser = await User.create({
      name: "testuser",
      email: `test-${uuidv4()}@example.com`,
      password: "hashedpassword",
      storageUsage: 0,
      storageQuota: 1024 * 1024 * 1024, // 1GB
    });

    rootFolder = await Folder.create({
      name: "RootFolder",
      user: mockUser._id,
      parent: null,
      ancestors: [],
      isTrashed: false,
    });
  });

  describe("Concurrent Folder Creation", () => {
    it("should handle multiple concurrent folder creations in same parent", async () => {
      const createPromises = Array.from({ length: 10 }, (_, i) =>
        folderService.createFolder({
          userId: String(mockUser._id),
          parentId: String(rootFolder._id),
          name: `Folder-${i}`,
        })
      );

      const results = await Promise.all(createPromises);

      expect(results).toHaveLength(10);
      results.forEach((folder, i) => {
        expect(folder.name).toBe(`Folder-${i}`);
        expect(folder.user.id).toBe(String(mockUser._id));
      });

      // Verify all folders were created
      const foldersInDb = await Folder.find({ parent: rootFolder._id });
      expect(foldersInDb).toHaveLength(10);
    });

    it("should prevent duplicate folder names in same parent (race condition)", async () => {
      const sameName = "DuplicateFolder";

      // Try to create folders with same name concurrently
      const createPromises = Array.from({ length: 5 }, () =>
        folderService
          .createFolder({
            userId: String(mockUser._id),
            parentId: String(rootFolder._id),
            name: sameName,
          })
          .catch((err) => err)
      );

      const results = await Promise.all(createPromises);

      // Some should fail due to duplicate name
      const succeeded = results.filter((r) => r && r.id);
      const failed = results.filter((r) => r instanceof Error);

      expect(succeeded.length).toBe(1); // Only one should succeed
      expect(failed.length).toBe(4);

      // Verify only one folder with that name exists
      const duplicates = await Folder.find({
        parent: rootFolder._id,
        name: sameName,
      });
      expect(duplicates).toHaveLength(1);
    });

    it("should handle concurrent nested folder creation", async () => {
      // Create level 1 folders
      const level1Folders = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          folderService.createFolder({
            userId: String(mockUser._id),
            parentId: String(rootFolder._id),
            name: `L1-${i}`,
          })
        )
      );

      // Create level 2 folders concurrently under each level 1 folder
      const level2Promises = level1Folders.flatMap((parent, i) =>
        Array.from({ length: 3 }, (_, j) =>
          folderService.createFolder({
            userId: String(mockUser._id),
            parentId: parent.id,
            name: `L2-${i}-${j}`,
          })
        )
      );

      const level2Folders = await Promise.all(level2Promises);

      expect(level2Folders).toHaveLength(9);

      // Verify ancestors are correctly set
      for (const folder of level2Folders) {
        const folderDoc = await Folder.findById(folder.id);
        expect(folderDoc?.ancestors).toHaveLength(2); // root + parent
      }
    });
  });

  describe("Concurrent Folder Operations", () => {
    it("should handle concurrent folder renames", async () => {
      const folder = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: String(rootFolder._id),
        name: "OriginalName",
      });

      // Concurrent rename operations
      const renamePromises = Array.from({ length: 5 }, (_, i) =>
        folderService
          .renameFolder(folder.id, String(mockUser._id), `Renamed-${i}`)
          .catch((err) => err)
      );

      const results = await Promise.all(renamePromises);

      // At least one should succeed
      const succeeded = results.filter((r) => !(r instanceof Error));
      expect(succeeded.length).toBeGreaterThan(0);

      // Final state should be consistent
      const finalFolder = await Folder.findById(folder.id);
      expect(finalFolder?.name).toMatch(/Renamed-\d+/);
    });

    it("should handle concurrent star/unstar operations", async () => {
      const folder = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: String(rootFolder._id),
        name: "StarTest",
      });

      // Concurrent star/unstar operations
      const operations = Array.from({ length: 20 }, (_, i) =>
        folderService.starFolder(folder.id, String(mockUser._id), i % 2 === 0)
      );

      await Promise.all(operations);

      // Final state should be consistent
      const finalFolder = await Folder.findById(folder.id);
      expect(typeof finalFolder?.isStarred).toBe("boolean");
    });

    it("should handle concurrent delete operations", async () => {
      const folder = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: String(rootFolder._id),
        name: "DeleteTest",
      });

      // Mark folder as trashed first
      await Folder.findByIdAndUpdate(folder.id, { isTrashed: true });

      // Multiple concurrent delete attempts
      const deletePromises = Array.from({ length: 5 }, () =>
        folderService
          .deleteFolderPermanent(folder.id, String(mockUser._id))
          .catch((err: any) => err)
      );

      const results = await Promise.all(deletePromises);

      // At least one should succeed
      const succeeded = results.filter((r: any) => r && !r.message);
      expect(succeeded.length).toBeGreaterThan(0);

      // Folder should be deleted
      const finalFolder = await Folder.findById(folder.id);
      expect(finalFolder).toBeNull();
    });
  });

  describe("Concurrent Folder Moving", () => {
    it("should handle concurrent folder moves between parents", async () => {
      const destinations = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          folderService.createFolder({
            userId: String(mockUser._id),
            parentId: String(rootFolder._id),
            name: `Destination-${i}`,
          })
        )
      );

      const foldersToMove = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          folderService.createFolder({
            userId: String(mockUser._id),
            parentId: String(rootFolder._id),
            name: `ToMove-${i}`,
          })
        )
      );

      // Move folders concurrently to different destinations
      const movePromises = foldersToMove.map((folder, i) =>
        folderService.moveFolder({
          folderId: folder.id,
          userId: String(mockUser._id),
          destinationId: destinations[i % destinations.length].id,
        })
      );

      const results = await Promise.all(movePromises);

      expect(results).toHaveLength(5);

      // Verify folders are in correct locations
      for (let i = 0; i < foldersToMove.length; i++) {
        const folder = await Folder.findById(foldersToMove[i].id);
        const expectedParent = destinations[i % destinations.length].id;
        expect(folder?.parent?.toString()).toBe(expectedParent);
      }
    });

    it("should prevent circular references during concurrent moves", async () => {
      // Create folder hierarchy: A -> B -> C
      const folderA = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: String(rootFolder._id),
        name: "FolderA",
      });

      const folderB = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: folderA.id,
        name: "FolderB",
      });

      const folderC = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: folderB.id,
        name: "FolderC",
      });

      // Try to create circular reference: move A into C
      const result = await folderService
        .moveFolder({
          folderId: folderA.id,
          userId: String(mockUser._id),
          destinationId: folderC.id,
        })
        .catch((err) => err);

      expect(result).toBeInstanceOf(Error);

      // Verify structure is intact
      const folderADoc = await Folder.findById(folderA.id);
      expect(folderADoc?.parent?.toString()).toBe(String(rootFolder._id));
    });

    it("should handle race condition when moving same folder to different destinations", async () => {
      const folder = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: String(rootFolder._id),
        name: "RaceFolder",
      });

      const destinations = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          folderService.createFolder({
            userId: String(mockUser._id),
            parentId: String(rootFolder._id),
            name: `Dest-${i}`,
          })
        )
      );

      // Try to move same folder to different destinations concurrently
      const movePromises = destinations.map((dest) =>
        folderService
          .moveFolder({
            folderId: folder.id,
            userId: String(mockUser._id),
            destinationId: dest.id,
          })
          .catch((err) => err)
      );

      const results = await Promise.all(movePromises);

      // At least one should succeed
      const succeeded = results.filter((r) => r && r.id);
      expect(succeeded.length).toBeGreaterThan(0);

      // Folder should end up in exactly one destination
      const finalFolder = await Folder.findById(folder.id);
      expect(finalFolder?.parent).toBeDefined();
      expect(
        destinations.some((d) => d.id === finalFolder!.parent?.toString())
      ).toBe(true);
    });
  });

  describe("Concurrent Operations with Folder Contents", () => {
    it("should handle concurrent operations on folder with files", async () => {
      const folder = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: String(rootFolder._id),
        name: "FolderWithFiles",
      });

      // Add files to folder concurrently
      const filePromises = Array.from({ length: 5 }, (_, i) =>
        uploadTestFile(
          fileService,
          String(mockUser._id),
          folder.id,
          `file-${i}.txt`,
          `content-${i}`
        )
      );

      const files = await Promise.all(filePromises);

      expect(files).toHaveLength(5);

      // Concurrent operations on folder and its files
      const operations = [
        folderService.renameFolder(
          folder.id,
          String(mockUser._id),
          "RenamedFolder"
        ),
        folderService.getFolderContent(folder.id, String(mockUser._id)),
        fileService.starFile(files[0].id, String(mockUser._id), true),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(3);

      // Verify folder content
      const content = await folderService.getFolderContent(
        folder.id,
        String(mockUser._id)
      );

      expect(content.files).toHaveLength(5);
    });

    it("should cascade delete folder with contents under concurrency", async () => {
      const parentWithContents = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: String(rootFolder._id),
        name: "ParentWithContents",
      });

      // Create nested structure with files
      const subFolder = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: parentWithContents.id,
        name: "SubFolder",
      });

      const filePromises = [
        ...Array.from({ length: 3 }, (_, i) =>
          uploadTestFile(
            fileService,
            String(mockUser._id),
            parentWithContents.id,
            `parent-file-${i}.txt`,
            `content-${i}`
          )
        ),
        ...Array.from({ length: 2 }, (_, i) =>
          uploadTestFile(
            fileService,
            String(mockUser._id),
            subFolder.id,
            `sub-file-${i}.txt`,
            `content-${i}`
          )
        ),
      ];

      await Promise.all(filePromises);

      // Mark folder as trashed first
      await Folder.findByIdAndUpdate(parentWithContents.id, {
        isTrashed: true,
      });

      // Delete parent folder
      await folderService.deleteFolderPermanent(
        parentWithContents.id,
        String(mockUser._id)
      );

      // Verify all contents are deleted
      const parentDoc = await Folder.findById(parentWithContents.id);
      const subDoc = await Folder.findById(subFolder.id);
      const filesDoc = await File.find({
        folder: { $in: [parentWithContents.id, subFolder.id] },
      });

      expect(parentDoc).toBeNull();
      expect(subDoc).toBeNull();
      expect(filesDoc).toHaveLength(0);

      // Verify storage was reclaimed
      const user = await User.findById(mockUser._id);
      expect(user?.storageUsage).toBe(0);
    });
  });

  describe("Concurrent Folder Tree Operations", () => {
    it("should maintain ancestor chain consistency during concurrent operations", async () => {
      // Create a deep hierarchy
      let currentParent = rootFolder;
      const folders: IFolder[] = [currentParent];

      for (let i = 0; i < 5; i++) {
        const folder = await folderService.createFolder({
          userId: String(mockUser._id),
          parentId: String(currentParent._id),
          name: `Level-${i}`,
        });
        const folderDoc = await Folder.findById(folder.id);
        folders.push(folderDoc!);
        currentParent = folderDoc!;
      }

      // Perform concurrent operations at different levels
      const operations = [
        folderService.renameFolder(
          String(folders[2]._id),
          String(mockUser._id),
          "RenamedLevel2"
        ),
        folderService.getFolderContent(
          String(folders[3]._id),
          String(mockUser._id)
        ),
        folderService.starFolder(
          String(folders[4]._id),
          String(mockUser._id),
          true
        ),
      ];

      await Promise.all(operations);

      // Verify ancestor chains are still correct
      for (let i = 1; i < folders.length; i++) {
        const folder = await Folder.findById(folders[i]._id);
        expect(folder?.ancestors).toHaveLength(i);
      }
    });

    it("should handle concurrent breadcrumb queries during modifications", async () => {
      // Create nested structure
      const level1 = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: String(rootFolder._id),
        name: "Level1",
      });

      const level2 = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: level1.id,
        name: "Level2",
      });

      const level3 = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: level2.id,
        name: "Level3",
      });

      // Concurrent breadcrumb queries while modifying
      const operations = [
        ...Array.from({ length: 10 }, () =>
          folderService.getFolderContent(level3.id, String(mockUser._id))
        ),
        folderService.renameFolder(
          level2.id,
          String(mockUser._id),
          "ModifiedLevel2"
        ),
        folderService.renameFolder(
          level1.id,
          String(mockUser._id),
          "ModifiedLevel1"
        ),
      ];

      const results = await Promise.all(operations);

      // All queries should succeed
      const queries = results.slice(0, 10) as IFolderContent[];
      queries.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.breadcrumbs).toBeDefined();
      });

      // Final breadcrumbs should reflect changes
      const finalContent = await folderService.getFolderContent(
        level3.id,
        String(mockUser._id)
      );

      expect(finalContent.breadcrumbs).toHaveLength(4); // root + 3 levels
    });
  });

  describe("Concurrency Edge Cases", () => {
    it("should handle simultaneous creation and deletion of sibling folders", async () => {
      // Create initial folders
      const initialFolders = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          folderService.createFolder({
            userId: String(mockUser._id),
            parentId: String(rootFolder._id),
            name: `Initial-${i}`,
          })
        )
      );

      // Mark folders as trashed first
      await Promise.all(
        initialFolders
          .slice(0, 3)
          .map((f) => Folder.findByIdAndUpdate(f.id, { isTrashed: true }))
      );

      // Simultaneously delete some and create new ones
      const operations = [
        ...initialFolders
          .slice(0, 3)
          .map((f) =>
            folderService.deleteFolderPermanent(f.id, String(mockUser._id))
          ),
        ...Array.from({ length: 3 }, (_, i) =>
          folderService.createFolder({
            userId: String(mockUser._id),
            parentId: String(rootFolder._id),
            name: `New-${i}`,
          })
        ),
      ];

      await Promise.all(operations.map((p) => p.catch((err: any) => err)));

      // Wait for operations to settle
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify final state
      const finalFolders = await Folder.find({
        parent: rootFolder._id,
        user: mockUser._id,
      });

      expect(finalFolders.length).toBeGreaterThanOrEqual(2); // At least some should exist
    });

    it("should maintain consistency when folder is moved while being modified", async () => {
      const destination = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: String(rootFolder._id),
        name: "Destination",
      });

      const folder = await folderService.createFolder({
        userId: String(mockUser._id),
        parentId: String(rootFolder._id),
        name: "ToMove",
      });

      // Simultaneously move and modify
      const operations = [
        folderService.moveFolder({
          folderId: folder.id,
          userId: String(mockUser._id),
          destinationId: destination.id,
        }),
        folderService.renameFolder(folder.id, String(mockUser._id), "Renamed"),
        folderService.starFolder(folder.id, String(mockUser._id), true),
      ];

      await Promise.all(operations);

      // Verify final state is consistent
      const finalFolder = await Folder.findById(folder.id);
      expect(finalFolder).toBeDefined();
      expect(finalFolder?.parent?.toString()).toBe(destination.id);
      expect(finalFolder?.name).toBeDefined();
    });
  });
});
