import Folder, { IFolder } from "../../models/Folder.model";
import File from "../../models/File.model";
import User, { IUser } from "../../models/User.model";
import { FileService } from "../../services/file.service";
import { BUCKETS } from "../../config/s3";
import { countObjectsInBucket, uploadTestFile } from "../utils/file.util";

describe("Test file service", () => {
  let fileService: FileService;
  let mockUser: IUser;
  let parentFolder: IFolder;
  let sharedHash: string;

  beforeEach(async () => {
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
    const mockContent = "test content";
  });

  it("File upload and hash handling", async () => {
    const file1 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "file1.txt",
      "test content",
      // pass hash to simulate duplicate content
      sharedHash
    );
    expect(file1).toBeDefined();
    const file1Doc = await File.findById(String(file1.id)).select("+hash +key");
    expect(file1Doc?.hash).toBe(sharedHash);

    const file2 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "file2.txt",
      "test content",
      sharedHash
    );
    expect(file2).toBeDefined();
    const file2Doc = await File.findById(String(file2.id)).select("+hash +key");
    expect(file2Doc?.hash).toBe(sharedHash);
    expect(file2Doc?.key).toEqual(file1Doc?.key);

    const objectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(objectCount).toBe(1);

    const file3 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "file3.txt",
      "test content",
      "unique-hash"
    );
    expect(file3).toBeDefined();
    const file3Doc = await File.findById(String(file3.id)).select("+hash +key");
    expect(file3Doc?.hash).toBe("unique-hash");
    expect(file3Doc?.key).not.toEqual(file1Doc?.key);

    const finalObjectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(finalObjectCount).toBe(2);
  });

  it("File delete handling", async () => {
    const file1 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "file1.txt",
      "test content",
      sharedHash
    );
    const file2 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "file2.txt",
      "test content",
      sharedHash
    );
    const file3 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "file3.txt",
      "test content",
      "unique-hash"
    );
    await fileService.trashFile(String(file1.id), String(mockUser._id));
    let objectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(objectCount).toBe(2);

    let file1InDb = await File.findById(String(file1.id));
    expect(file1InDb?.isTrashed).toBe(true);

    await fileService.trashFile(String(file2.id), String(mockUser._id));
    objectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(objectCount).toBe(2);

    let file2InDb = await File.findById(String(file2.id));
    expect(file2InDb?.isTrashed).toBe(true);

    await fileService.trashFile(String(file3.id), String(mockUser._id));

    await fileService.deleteFilePermanent(
      String(file1.id),
      String(mockUser._id)
    );
    file1InDb = await File.findById(String(file1.id));
    expect(file1InDb).toBeNull();
    objectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(objectCount).toBe(2);

    await fileService.deleteFilePermanent(
      String(file2.id),
      String(mockUser._id)
    );
    objectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(objectCount).toBe(1);

    await fileService.deleteFilePermanent(
      String(file3.id),
      String(mockUser._id)
    );
    objectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(objectCount).toBe(0);
  });

  it("File restore handling", async () => {
    const file = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "file.txt",
      "test content",
      "restore-hash"
    );

    await fileService.trashFile(String(file.id), String(mockUser._id));
    let fileInDb = await File.findById(String(file.id));
    expect(fileInDb?.isTrashed).toBe(true);
    expect(fileInDb?.trashedAt).toBeDefined();

    await fileService.restoreFile(String(file.id), String(mockUser._id));
    fileInDb = await File.findById(String(file.id));
    expect(fileInDb?.isTrashed).toBe(false);
    expect(fileInDb?.trashedAt).toBeNull();
  });

  it("File star handling", async () => {
    const file = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "star-file.txt",
      "test content",
      "star-hash"
    );

    let fileInDb = await File.findById(String(file.id));
    expect(fileInDb?.isStarred).toBe(false);

    await fileService.starFile(String(file.id), String(mockUser._id), true);
    fileInDb = await File.findById(String(file.id));
    expect(fileInDb?.isStarred).toBe(true);

    await fileService.starFile(String(file.id), String(mockUser._id), false);
    fileInDb = await File.findById(String(file.id));
    expect(fileInDb?.isStarred).toBe(false);
  });

  it("File rename handling", async () => {
    const file = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "original.txt",
      "test content",
      "rename-hash"
    );

    await fileService.renameFile(
      String(file.id),
      String(mockUser._id),
      "renamed.txt"
    );
    const fileInDb = await File.findById(String(file.id));
    expect(fileInDb?.name).toBe("renamed.txt");
  });

  it("File move handling", async () => {
    const targetFolder = await Folder.create({
      name: "TargetFolder",
      user: mockUser._id,
      parent: null,
      ancestors: [],
      isTrashed: false,
    });

    const file = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "movable.txt",
      "test content",
      "move-hash"
    );

    let fileInDb = await File.findById(String(file.id));
    expect(fileInDb?.folder?.toString()).toBe(parentFolder._id.toString());

    await fileService.moveFile(
      String(file.id),
      String(mockUser._id),
      String(targetFolder._id)
    );

    fileInDb = await File.findById(String(file.id));
    expect(fileInDb?.folder?.toString()).toBe(targetFolder._id.toString());
    expect(fileInDb?.ancestors).toHaveLength(1);
    expect(fileInDb?.ancestors[0].toString()).toBe(targetFolder._id.toString());
  });

  it("Get starred files", async () => {
    const file1 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "starred1.txt",
      "test content",
      "starred1-hash"
    );

    const file2 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "starred2.txt",
      "test content",
      "starred2-hash"
    );

    await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "not-starred.txt",
      "test content",
      "not-starred-hash"
    );

    await fileService.starFile(String(file1.id), String(mockUser._id), true);
    await fileService.starFile(String(file2.id), String(mockUser._id), true);

    const starredFiles = await fileService.getStarredFiles(
      String(mockUser._id)
    );
    expect(starredFiles).toHaveLength(2);
    expect(starredFiles.map((f) => f.id)).toContain(String(file1.id));
    expect(starredFiles.map((f) => f.id)).toContain(String(file2.id));
  });

  it("Get trashed files", async () => {
    const file1 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "trashed1.txt",
      "test content",
      "trashed1-hash"
    );

    const file2 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "trashed2.txt",
      "test content",
      "trashed2-hash"
    );

    await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "not-trashed.txt",
      "test content",
      "not-trashed-hash"
    );

    await fileService.trashFile(String(file1.id), String(mockUser._id));
    await fileService.trashFile(String(file2.id), String(mockUser._id));

    const trashedFiles = await fileService.getTrashedFiles(
      String(mockUser._id)
    );
    expect(trashedFiles).toHaveLength(2);
    expect(trashedFiles.map((f) => f.id)).toContain(String(file1.id));
    expect(trashedFiles.map((f) => f.id)).toContain(String(file2.id));
  });

  it("Get recent files", async () => {
    await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "recent1.txt",
      "test content",
      "recent1-hash"
    );

    await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "recent2.txt",
      "test content",
      "recent2-hash"
    );

    const recentFiles = await fileService.getRecentFiles(
      String(mockUser._id),
      10
    );
    expect(recentFiles.length).toBeGreaterThanOrEqual(2);
  });

  it("Get all user files", async () => {
    await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "all1.txt",
      "test content",
      "all1-hash"
    );

    await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "all2.txt",
      "test content",
      "all2-hash"
    );

    const allFiles = await fileService.getAllUserFiles(String(mockUser._id));
    expect(allFiles.length).toBeGreaterThanOrEqual(2);
  });
});
