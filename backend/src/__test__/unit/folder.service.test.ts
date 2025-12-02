import { IFile } from "../../models/File.model";
import Folder, { IFolder } from "../../models/Folder.model";
import File from "../../models/File.model";
import User, { IUser } from "../../models/User.model";
import { FileService } from "../../services/file.service";
import { FolderService } from "../../services/folder.service";
import { testMinioClient } from "../setup";

describe("Test file service", () => {
  let folderService: FolderService;
  let fileService: FileService;
  let mockUser: IUser;
  let parentFolder: IFolder;
  let sharedHash: string;
  let file1: IFile;
  let file2: IFile;
  let file3: IFile;

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
    const mockContent = "test content";
    const mockBuffer = Buffer.from(mockContent);
    file1 = await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(parentFolder._id),
      fileBuffer: mockBuffer,
      fileSize: mockBuffer.length,
      mimeType: "text/plain",
      originalName: "file1.txt",
      hash: sharedHash,
    });

    file2 = await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(parentFolder._id),
      fileBuffer: mockBuffer,
      fileSize: mockBuffer.length,
      mimeType: "text/plain",
      originalName: "file2.txt",
      hash: sharedHash,
    });

    file3 = await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(parentFolder._id),
      fileBuffer: mockBuffer,
      fileSize: mockBuffer.length,
      mimeType: "text/plain",
      originalName: "file3.txt",
      hash: "unique-hash",
    });
  });

  it("Folder creation", async () => {
    const folder1 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "Folder1",
    });

    const folder2 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(folder1._id),
      name: "Folder2",
    });

    expect(folder1.parent?.toString()).toBe(parentFolder._id.toString());
    expect(folder1.ancestors).toHaveLength(1);
    expect(folder1.ancestors[0].toString()).toBe(parentFolder._id.toString());

    expect(folder2.parent?.toString()).toBe(folder1._id.toString());
    expect(folder2.ancestors).toHaveLength(2);
    expect(folder2.ancestors[0].toString()).toBe(parentFolder._id.toString());
    expect(folder2.ancestors[1].toString()).toBe(folder1._id.toString());
  });

  it("delete folder with contents", async () => {
    const folder1 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "Folder1",
    });

    const mockContent = "test content";
    const mockBuffer = Buffer.from(mockContent);

    await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(folder1._id),
      fileBuffer: mockBuffer,
      fileSize: mockBuffer.length,
      mimeType: "text/plain",
      originalName: "fileInFolder.txt",
      hash: "folder-file-hash",
    });

    await folderService.trashFolder(
      String(parentFolder._id),
      String(mockUser._id)
    );
    const trashedFolders = await Folder.find({ isTrashed: true });
    expect(trashedFolders).toHaveLength(2);
    const trashedFiles = await File.find({ isTrashed: true });
    expect(trashedFiles).toHaveLength(4);

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
    const mockBuffer = Buffer.from(mockContent);

    await fileService.uploadFile({
      userId: String(mockUser._id),
      folderId: String(folder1._id),
      fileBuffer: mockBuffer,
      fileSize: mockBuffer.length,
      mimeType: "text/plain",
      originalName: "file-in-folder.txt",
      hash: sharedHash,
    });

    await folderService.trashFolder(String(folder1._id), String(mockUser._id));
    await folderService.deleteFolderPermanent(
      String(folder1._id),
      String(mockUser._id)
    );

    const objectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
    expect(objectCount).toBe(2);

    const remainingFiles = await File.find({ isTrashed: false });
    expect(remainingFiles).toHaveLength(3);
  });

  it("delete parent folder with subfolders", async () => {
    const folder1 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(parentFolder._id),
      name: "Folder1",
    });

    const folder2 = await folderService.createFolder({
      userId: String(mockUser._id),
      parentId: String(folder1._id),
      name: "Folder2",
    });

    await folderService.trashFolder(
      String(parentFolder._id),
      String(mockUser._id)
    );
    await folderService.deleteFolderPermanent(
      String(parentFolder._id),
      String(mockUser._id)
    );

    const folder1InDb = await Folder.findById(String(folder1._id));
    const folder2InDb = await Folder.findById(String(folder2._id));
    expect(folder1InDb).toBeNull();
    expect(folder2InDb).toBeNull();

    const remainingFolders = await Folder.find({});
    expect(remainingFolders).toHaveLength(0);
  });
});
