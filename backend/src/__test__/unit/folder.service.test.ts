import Folder, { IFolder } from "../../models/Folder.model";
import File from "../../models/File.model";
import User, { IUser } from "../../models/User.model";
import { FileService } from "../../services/file.service";
import { FolderService } from "../../services/folder.service";
import { BUCKETS } from "../../config/s3";
import { countObjectsInBucket, uploadTestFile } from "../utils/file.util";

describe("Test file service", () => {
  let folderService: FolderService;
  let fileService: FileService;
  let mockUser: IUser;
  let parentFolder: IFolder;
  let sharedHash: string;

  beforeEach(async () => {
    folderService = new FolderService();
    fileService = new FileService();

    mockUser = await User.create({
      name: "testuser",
      email: "test@example.com",
      password: "hashedpassword",
      storageUsage: 0,
      storageQuota: 1024 * 1024 * 1024,
    });

    parentFolder = await Folder.create({
      name: "ParentFolder",
      user: mockUser._id,
      parent: null,
      ancestors: [],
      isTrashed: false,
    });

    sharedHash = "shared-hash";
  });

  it("Folder creation", async () => {
    const folder1 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "Folder1",
    });
    const folder1Doc = await Folder.findById(folder1.id);

    const folder2 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(folder1.id),
      name: "Folder2",
    });
    const folder2Doc = await Folder.findById(folder2.id);

    expect(folder1Doc?.parent?.toString()).toBe(parentFolder._id.toString());
    expect(folder1Doc?.ancestors).toHaveLength(1);
    expect(folder1Doc?.ancestors[0].toString()).toBe(
      parentFolder._id.toString()
    );

    expect(folder2Doc?.parent?.toString()).toBe(folder1Doc?._id.toString());
    expect(folder2Doc?.ancestors).toHaveLength(2);
    expect(folder2Doc?.ancestors[0].toString()).toBe(
      parentFolder._id.toString()
    );
    expect(folder2Doc?.ancestors[1].toString()).toBe(
      folder1Doc?._id.toString()
    );
  });

  it("delete folder with contents", async () => {
    const folder1 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "Folder1",
    });

    await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(folder1.id),
      "fileInFolder.txt",
      "test content",
      "folder-file-hash"
    );

    await folderService.trashFolder(
      String(parentFolder._id),
      String(mockUser._id)
    );
    const trashedFolders = await Folder.find({ isTrashed: true });
    expect(trashedFolders).toHaveLength(2);
    const trashedFiles = await File.find({ isTrashed: true });
    expect(trashedFiles).toHaveLength(1);

    await folderService.deleteFolderPermanent(
      String(parentFolder._id),
      String(mockUser._id)
    );
    const remainingFolders = await Folder.find({});
    const remainingFiles = await File.find({});
    expect(remainingFolders).toHaveLength(0);
    expect(remainingFiles).toHaveLength(0);
  });

  it("delete folder with shared hash files", async () => {
    const folder1 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "Folder1",
    });

    const mockContent = "test content";

    await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(folder1.id),
      "file-in-folder.txt",
      "test content",
      sharedHash
    );

    await folderService.trashFolder(String(folder1.id), String(mockUser._id));
    await folderService.deleteFolderPermanent(
      String(folder1.id),
      String(mockUser._id)
    );

    const objectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(objectCount).toBe(0);

    const remainingFiles = await File.find({ isTrashed: false });
    expect(remainingFiles).toHaveLength(0);
  });

  it("delete parent folder with subfolders", async () => {
    const folder1 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "Folder1",
    });

    const folder2 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(folder1.id),
      name: "Folder2",
    });
    const folder2Doc = await Folder.findById(folder2.id);

    await folderService.trashFolder(
      String(parentFolder._id),
      String(mockUser._id)
    );
    await folderService.deleteFolderPermanent(
      String(parentFolder._id),
      String(mockUser._id)
    );

    const folder1InDb = await Folder.findById(String(folder1.id));
    const folder2InDb = await Folder.findById(String(folder2.id));
    expect(folder1InDb).toBeNull();
    expect(folder2InDb).toBeNull();

    const remainingFolders = await Folder.find({});
    expect(remainingFolders).toHaveLength(0);
  });

  it("Folder restore handling", async () => {
    const folder = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "RestoreFolder",
    });

    await folderService.trashFolder(String(folder.id), String(mockUser._id));
    let folderInDb = await Folder.findById(String(folder.id));
    expect(folderInDb?.isTrashed).toBe(true);
    expect(folderInDb?.trashedAt).toBeDefined();

    await folderService.restoreFolder(String(folder.id), String(mockUser._id));
    folderInDb = await Folder.findById(String(folder.id));
    expect(folderInDb?.isTrashed).toBe(false);
    expect(folderInDb?.trashedAt).toBeNull();
  });

  it("Folder star handling", async () => {
    const folder = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "StarFolder",
    });

    let folderInDb = await Folder.findById(String(folder.id));
    expect(folderInDb?.isStarred).toBe(false);

    await folderService.starFolder(
      String(folder.id),
      String(mockUser._id),
      true
    );
    folderInDb = await Folder.findById(String(folder.id));
    expect(folderInDb?.isStarred).toBe(true);

    await folderService.starFolder(
      String(folder.id),
      String(mockUser._id),
      false
    );
    folderInDb = await Folder.findById(String(folder.id));
    expect(folderInDb?.isStarred).toBe(false);
  });

  it("Folder rename handling", async () => {
    const folder = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "OriginalName",
    });

    await folderService.renameFolder(
      String(folder.id),
      String(mockUser._id),
      "RenamedFolder"
    );
    const folderInDb = await Folder.findById(String(folder.id));
    expect(folderInDb?.name).toBe("RenamedFolder");
  });

  it("Folder move handling", async () => {
    const targetFolder = await Folder.create({
      name: "TargetFolder",
      user: mockUser._id,
      parent: null,
      ancestors: [],
      isTrashed: false,
    });

    const movableFolder = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "MovableFolder",
    });

    let folderInDb = await Folder.findById(String(movableFolder.id));
    expect(folderInDb?.parent?.toString()).toBe(parentFolder._id.toString());

    await folderService.moveFolder({
      folderId: String(movableFolder.id),
      destinationId: String(targetFolder._id),
      userId: String(mockUser._id),
    });

    folderInDb = await Folder.findById(String(movableFolder.id));
    expect(folderInDb?.parent?.toString()).toBe(targetFolder._id.toString());
    expect(folderInDb?.ancestors).toHaveLength(1);
    expect(folderInDb?.ancestors[0].toString()).toBe(
      targetFolder._id.toString()
    );
  });

  it("Get starred folders", async () => {
    const folder1 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "StarredFolder1",
    });

    const folder2 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "StarredFolder2",
    });

    await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "NotStarredFolder",
    });

    await folderService.starFolder(
      String(folder1.id),
      String(mockUser._id),
      true
    );
    await folderService.starFolder(
      String(folder2.id),
      String(mockUser._id),
      true
    );

    const starredFolders = await folderService.getStarredFolders(
      String(mockUser._id)
    );
    expect(starredFolders).toHaveLength(2);
    expect(starredFolders.map((f) => f.id)).toContain(String(folder1.id));
    expect(starredFolders.map((f) => f.id)).toContain(String(folder2.id));
  });

  it("Get trashed folders", async () => {
    const folder1 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "TrashedFolder1",
    });

    const folder2 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "TrashedFolder2",
    });

    await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "NotTrashedFolder",
    });

    await folderService.trashFolder(String(folder1.id), String(mockUser._id));
    await folderService.trashFolder(String(folder2.id), String(mockUser._id));

    const trashedFolders = await folderService.getTrashedFolders(
      String(mockUser._id)
    );
    expect(trashedFolders).toHaveLength(2);
    expect(trashedFolders.map((f) => f.id)).toContain(String(folder1.id));
    expect(trashedFolders.map((f) => f.id)).toContain(String(folder2.id));
  });

  it("Get recent folders", async () => {
    await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "RecentFolder1",
    });

    await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "RecentFolder2",
    });

    const recentFolders = await folderService.getRecentFolders(
      String(mockUser._id),
      10
    );
    expect(recentFolders.length).toBeGreaterThanOrEqual(2);
  });

  it("Get folder content", async () => {
    const folder = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "ContentFolder",
    });

    await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(folder.id),
      name: "SubFolder",
    });

    await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(folder.id),
      "file.txt",
      "test content",
      "content-hash"
    );

    const content = await folderService.getFolderContent(
      String(folder.id),
      String(mockUser._id)
    );

    expect(content.currentFolder.id).toBe(String(folder.id));
    expect(content.folders).toHaveLength(1);
    expect(content.files).toHaveLength(1);
    expect(content.breadcrumbs.length).toBeGreaterThanOrEqual(1);
  });
});
