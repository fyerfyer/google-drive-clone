import Folder from "../../models/Folder.model";
import File from "../../models/File.model";
import User, { IUser } from "../../models/User.model";
import { FileService } from "../../services/file.service";
import { FolderService } from "../../services/folder.service";
import { BUCKETS } from "../../config/s3";
import { countObjectsInBucket, uploadTestFile } from "../utils/file.util";

describe("Folder-File Integration Test", () => {
  let folderService: FolderService;
  let fileService: FileService;
  let mockUser: IUser;

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
  });

  it("complete folder and file lifecycle", async () => {
    const rootFolder = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: "",
      name: "Root",
    });
    const rootFolderDoc = await Folder.findById(rootFolder.id);
    const subFolder1 = await folderService.createFolder({
      userId: String(mockUser.id),
      parentId: String(rootFolder.id),
      name: "SubFolder1",
    });
    const subFolder1Doc = await Folder.findById(subFolder1.id);

    const subFolder2 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(subFolder1.id),
      name: "SubFolder2",
    });
    const subFolder2Doc = await Folder.findById(subFolder2.id);

    // 测试祖先路径
    expect(rootFolderDoc?.ancestors).toHaveLength(0);
    expect(subFolder1Doc?.ancestors).toHaveLength(1);
    expect(subFolder2Doc?.ancestors).toHaveLength(2);

    const mockContent1 = "content for file 1";
    const file1 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(rootFolder.id),
      "file1.txt",
      mockContent1,
      "hash1"
    );

    const mockContent2 = "content for file 2";
    const file2 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(subFolder1.id),
      "file2.txt",
      mockContent2,
      "hash2"
    );

    const mockContent3 = "content for file 3";
    const file3 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(subFolder2.id),
      "file3.txt",
      mockContent3,
      "hash3"
    );

    // 测试文件上传
    let objectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(objectCount).toBe(3);

    const file4 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(rootFolder.id),
      "file4.txt",
      mockContent1,
      "hash1"
    );

    // 测试 hash 快传 (通过 MinIO 对象数量断言)
    objectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(objectCount).toBe(3);

    // 测试回收站和恢复功能
    await fileService.trashFile(String(file1.id), String(mockUser._id));
    let file1InDb = await File.findById(String(file1.id));
    expect(file1InDb?.isTrashed).toBe(true);

    await folderService.trashFolder(
      String(subFolder1.id),
      String(mockUser._id)
    );
    let subFolder1InDb = await Folder.findById(String(subFolder1.id));
    let subFolder2InDb = await Folder.findById(String(subFolder2.id));
    let file2InDb = await File.findById(String(file2.id));
    let file3InDb = await File.findById(String(file3.id));

    expect(subFolder1InDb?.isTrashed).toBe(true);
    expect(subFolder2InDb?.isTrashed).toBe(true);
    expect(file2InDb?.isTrashed).toBe(true);
    expect(file3InDb?.isTrashed).toBe(true);

    await fileService.restoreFile(String(file1.id), String(mockUser._id));
    file1InDb = await File.findById(String(file1.id));
    expect(file1InDb?.isTrashed).toBe(false);

    await folderService.restoreFolder(
      String(subFolder1.id),
      String(mockUser._id)
    );
    subFolder1InDb = await Folder.findById(String(subFolder1.id));
    subFolder2InDb = await Folder.findById(String(subFolder2.id));
    file2InDb = await File.findById(String(file2.id));
    file3InDb = await File.findById(String(file3.id));

    expect(subFolder1InDb?.isTrashed).toBe(false);
    expect(subFolder2InDb?.isTrashed).toBe(false);
    expect(file2InDb?.isTrashed).toBe(false);
    expect(file3InDb?.isTrashed).toBe(false);

    // 测试永久删除
    await fileService.trashFile(String(file1.id), String(mockUser._id));
    await fileService.deleteFilePermanent(
      String(file1.id),
      String(mockUser._id)
    );
    file1InDb = await File.findById(String(file1.id));
    expect(file1InDb).toBeNull();

    objectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(objectCount).toBe(3);

    await folderService.trashFolder(
      String(rootFolder.id),
      String(mockUser._id)
    );
    await folderService.deleteFolderPermanent(
      String(rootFolder.id),
      String(mockUser._id)
    );

    const allFolders = await Folder.find({});
    const allFiles = await File.find({});
    expect(allFolders).toHaveLength(0);
    expect(allFiles).toHaveLength(0);

    objectCount = await countObjectsInBucket(BUCKETS.FILES);
    expect(objectCount).toBe(0);
  });

  it("move folder with files", async () => {
    const folder1 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: "",
      name: "Folder1",
    });

    const folder2 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: "",
      name: "Folder2",
    });

    const subFolder = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(folder1.id),
      name: "SubFolder",
    });

    const mockContent = "test content";
    const file = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(subFolder.id),
      "file.txt",
      mockContent,
      "file-hash"
    );

    await folderService.moveFolder({
      folderId: String(subFolder.id),
      destinationId: String(folder2.id),
      userId: String(mockUser._id),
    });

    const movedFolder = await Folder.findById(String(subFolder.id));
    expect(movedFolder?.parent?.toString()).toBe(folder2.id.toString());
    expect(movedFolder?.ancestors).toHaveLength(1);
    expect(movedFolder?.ancestors[0].toString()).toBe(folder2.id.toString());

    const fileInDb = await File.findById(String(file.id));
    expect(fileInDb?.folder.toString()).toBe(subFolder.id.toString());
  });

  it("rename folder and file", async () => {
    const folder = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: "",
      name: "OriginalFolder",
    });
    const folderDoc = await Folder.findById(folder.id);

    const mockContent = "test content";
    const file = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(folder.id),
      "original.txt",
      mockContent,
      "file-hash"
    );

    await folderService.renameFolder(
      String(folder.id),
      String(mockUser._id),
      "RenamedFolder"
    );
    const renamedFolder = await Folder.findById(String(folder.id));
    expect(renamedFolder?.name).toBe("RenamedFolder");

    await fileService.renameFile(
      String(file.id),
      String(mockUser._id),
      "renamed.txt"
    );
    const renamedFile = await File.findById(String(file.id));
    expect(renamedFile?.name).toBe("renamed.txt");
    expect(renamedFile?.originalName).toBe("original.txt");
  });

  it("star and unstar operations", async () => {
    const folder = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: "",
      name: "TestFolder",
    });

    const mockContent = "test content";
    const file = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(folder.id),
      "test.txt",
      mockContent,
      "file-hash"
    );

    await folderService.starFolder(
      String(folder.id),
      String(mockUser._id),
      true
    );
    let folderInDb = await Folder.findById(String(folder.id));
    expect(folderInDb?.isStarred).toBe(true);

    await fileService.starFile(String(file.id), String(mockUser._id), true);
    let fileInDb = await File.findById(String(file.id));
    expect(fileInDb?.isStarred).toBe(true);

    await folderService.starFolder(
      String(folder.id),
      String(mockUser._id),
      false
    );
    folderInDb = await Folder.findById(String(folder.id));
    expect(folderInDb?.isStarred).toBe(false);

    await fileService.starFile(String(file.id), String(mockUser._id), false);
    fileInDb = await File.findById(String(file.id));
    expect(fileInDb?.isStarred).toBe(false);
  });
});
