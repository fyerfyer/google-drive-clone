import Folder, { IFolder } from "../../models/Folder.model";
import File, { IFile } from "../../models/File.model";
import User, { IUser } from "../../models/User.model";
import { FileService } from "../../services/file.service";
import { FolderService } from "../../services/folder.service";
import { testMinioClient } from "../setup";
import { rename } from "fs";

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

    const subFolder1 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(rootFolder._id),
      name: "SubFolder1",
    });

    const subFolder2 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(subFolder1._id),
      name: "SubFolder2",
    });

    // 测试祖先路径
    expect(rootFolder.ancestors).toHaveLength(0);
    expect(subFolder1.ancestors).toHaveLength(1);
    expect(subFolder2.ancestors).toHaveLength(2);

    const mockContent1 = "content for file 1";
    const mockBuffer1 = Buffer.from(mockContent1);
    const file1 = await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(rootFolder._id),
      fileBuffer: mockBuffer1,
      fileSize: mockBuffer1.length,
      mimeType: "text/plain",
      originalName: "file1.txt",
      hash: "hash1",
    });

    const mockContent2 = "content for file 2";
    const mockBuffer2 = Buffer.from(mockContent2);
    const file2 = await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(subFolder1._id),
      fileBuffer: mockBuffer2,
      fileSize: mockBuffer2.length,
      mimeType: "text/plain",
      originalName: "file2.txt",
      hash: "hash2",
    });

    const mockContent3 = "content for file 3";
    const mockBuffer3 = Buffer.from(mockContent3);
    const file3 = await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(subFolder2._id),
      fileBuffer: mockBuffer3,
      fileSize: mockBuffer3.length,
      mimeType: "text/plain",
      originalName: "file3.txt",
      hash: "hash3",
    });

    // 测试文件上传
    let objectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
    expect(objectCount).toBe(3);

    const file4 = await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(rootFolder._id),
      fileBuffer: mockBuffer1,
      fileSize: mockBuffer1.length,
      mimeType: "text/plain",
      originalName: "file4.txt",
      hash: "hash1",
    });

    // 测试 hash 快传
    expect(file4.key).toBe(file1.key);
    objectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
    expect(objectCount).toBe(3);

    // 测试回收站和恢复功能
    await fileService.trashFile(String(file1._id), String(mockUser._id));
    let file1InDb = await File.findById(String(file1._id));
    expect(file1InDb?.isTrashed).toBe(true);

    await folderService.trashFolder(
      String(subFolder1._id),
      String(mockUser._id)
    );
    let subFolder1InDb = await Folder.findById(String(subFolder1._id));
    let subFolder2InDb = await Folder.findById(String(subFolder2._id));
    let file2InDb = await File.findById(String(file2._id));
    let file3InDb = await File.findById(String(file3._id));

    expect(subFolder1InDb?.isTrashed).toBe(true);
    expect(subFolder2InDb?.isTrashed).toBe(true);
    expect(file2InDb?.isTrashed).toBe(true);
    expect(file3InDb?.isTrashed).toBe(true);

    await fileService.restoreFile(String(file1._id), String(mockUser._id));
    file1InDb = await File.findById(String(file1._id));
    expect(file1InDb?.isTrashed).toBe(false);

    await folderService.restoreFolder(
      String(subFolder1._id),
      String(mockUser._id)
    );
    subFolder1InDb = await Folder.findById(String(subFolder1._id));
    subFolder2InDb = await Folder.findById(String(subFolder2._id));
    file2InDb = await File.findById(String(file2._id));
    file3InDb = await File.findById(String(file3._id));

    expect(subFolder1InDb?.isTrashed).toBe(false);
    expect(subFolder2InDb?.isTrashed).toBe(false);
    expect(file2InDb?.isTrashed).toBe(false);
    expect(file3InDb?.isTrashed).toBe(false);

    // 测试永久删除
    await fileService.trashFile(String(file1._id), String(mockUser._id));
    await fileService.deleteFilePermanent(
      String(file1._id),
      String(mockUser._id)
    );
    file1InDb = await File.findById(String(file1._id));
    expect(file1InDb).toBeNull();

    objectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
    expect(objectCount).toBe(3);

    await folderService.trashFolder(
      String(rootFolder._id),
      String(mockUser._id)
    );
    await folderService.deleteFolderPermanent(
      String(rootFolder._id),
      String(mockUser._id)
    );

    const allFolders = await Folder.find({});
    const allFiles = await File.find({});
    expect(allFolders).toHaveLength(0);
    expect(allFiles).toHaveLength(0);

    objectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
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
      parentId: String(folder1._id),
      name: "SubFolder",
    });

    const mockContent = "test content";
    const mockBuffer = Buffer.from(mockContent);
    const file = await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(subFolder._id),
      fileBuffer: mockBuffer,
      fileSize: mockBuffer.length,
      mimeType: "text/plain",
      originalName: "file.txt",
      hash: "file-hash",
    });

    await folderService.moveFolder({
      folderId: String(subFolder._id),
      destinationId: String(folder2._id),
      userId: String(mockUser._id),
    });

    const movedFolder = await Folder.findById(String(subFolder._id));
    expect(movedFolder?.parent?.toString()).toBe(folder2._id.toString());
    expect(movedFolder?.ancestors).toHaveLength(1);
    expect(movedFolder?.ancestors[0].toString()).toBe(folder2._id.toString());

    const fileInDb = await File.findById(String(file._id));
    expect(fileInDb?.folder.toString()).toBe(subFolder._id.toString());
  });

  it("rename folder and file", async () => {
    const folder = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: "",
      name: "OriginalFolder",
    });

    const mockContent = "test content";
    const mockBuffer = Buffer.from(mockContent);
    const file = await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(folder._id),
      fileBuffer: mockBuffer,
      fileSize: mockBuffer.length,
      mimeType: "text/plain",
      originalName: "original.txt",
      hash: "file-hash",
    });

    await folderService.renameFolder(
      String(folder._id),
      String(mockUser._id),
      "RenamedFolder"
    );
    const renamedFolder = await Folder.findById(String(folder._id));
    expect(renamedFolder?.name).toBe("RenamedFolder");

    await fileService.renameFile(
      String(file._id),
      String(mockUser._id),
      "renamed.txt"
    );
    const renamedFile = await File.findById(String(file._id));
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
    const mockBuffer = Buffer.from(mockContent);
    const file = await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(folder._id),
      fileBuffer: mockBuffer,
      fileSize: mockBuffer.length,
      mimeType: "text/plain",
      originalName: "test.txt",
      hash: "file-hash",
    });

    await folderService.starFolder(
      String(folder._id),
      String(mockUser._id),
      true
    );
    let folderInDb = await Folder.findById(String(folder._id));
    expect(folderInDb?.isStarred).toBe(true);

    await fileService.starFile(String(file._id), String(mockUser._id), true);
    let fileInDb = await File.findById(String(file._id));
    expect(fileInDb?.isStarred).toBe(true);

    await folderService.starFolder(
      String(folder._id),
      String(mockUser._id),
      false
    );
    folderInDb = await Folder.findById(String(folder._id));
    expect(folderInDb?.isStarred).toBe(false);

    await fileService.starFile(String(file._id), String(mockUser._id), false);
    fileInDb = await File.findById(String(file._id));
    expect(fileInDb?.isStarred).toBe(false);
  });
});
