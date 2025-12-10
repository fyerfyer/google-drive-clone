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
    const mockBuffer = Buffer.from(mockContent);
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
});
