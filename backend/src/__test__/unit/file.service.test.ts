import Folder, { IFolder } from "../../models/Folder.model";
import File from "../../models/File.model";
import User, { IUser } from "../../models/User.model";
import { FileService } from "../../services/file.service";
import { testMinioClient } from "../setup";

describe("Test file service", () => {
  let fileService: FileService;
  let mockUser: IUser;
  let parentFolder: IFolder;
  let sharedHash: string;
  let fileDTO1: any;
  let fileDTO2: any;
  let fileDTO3: any;

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
    fileDTO1 = {
      name: "file1.txt",
      userId: String(mockUser._id),
      folderId: String(parentFolder._id),
      fileBuffer: mockBuffer,
      fileSize: mockBuffer.length,
      mimeType: "text/plain",
      originalName: "file1.txt",
      hash: sharedHash,
    };

    fileDTO2 = {
      name: "file2.txt",
      userId: String(mockUser._id),
      folderId: String(parentFolder._id),
      fileBuffer: mockBuffer,
      fileSize: mockBuffer.length,
      mimeType: "text/plain",
      originalName: "file2.txt",
      hash: sharedHash,
    };

    fileDTO3 = {
      name: "file3.txt",
      userId: String(mockUser._id),
      folderId: String(parentFolder._id),
      fileBuffer: mockBuffer,
      fileSize: mockBuffer.length,
      mimeType: "text/plain",
      originalName: "file3.txt",
      hash: "unique-hash",
    };
  });

  it("File upload and hash handling", async () => {
    const file1 = await fileService.uploadFile(fileDTO1);
    expect(file1).toBeDefined();
    const file1Doc = await File.findById(String(file1.id)).select("+hash +key");
    expect(file1Doc?.hash).toBe(sharedHash);

    const file2 = await fileService.uploadFile(fileDTO2);
    expect(file2).toBeDefined();
    const file2Doc = await File.findById(String(file2.id)).select("+hash +key");
    expect(file2Doc?.hash).toBe(sharedHash);
    expect(file2Doc?.key).toEqual(file1Doc?.key);

    const objectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
    expect(objectCount).toBe(1);

    const file3 = await fileService.uploadFile(fileDTO3);
    expect(file3).toBeDefined();
    const file3Doc = await File.findById(String(file3.id)).select("+hash +key");
    expect(file3Doc?.hash).toBe("unique-hash");
    expect(file3Doc?.key).not.toEqual(file1Doc?.key);

    const finalObjectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
    expect(finalObjectCount).toBe(2);
  });

  it("File delete handling", async () => {
    const file1 = await fileService.uploadFile(fileDTO1);
    const file2 = await fileService.uploadFile(fileDTO2);
    const file3 = await fileService.uploadFile(fileDTO3);
    await fileService.trashFile(String(file1.id), String(mockUser._id));
    let objectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
    expect(objectCount).toBe(2);

    let file1InDb = await File.findById(String(file1.id));
    expect(file1InDb?.isTrashed).toBe(true);

    await fileService.trashFile(String(file2.id), String(mockUser._id));
    objectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
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
    objectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
    expect(objectCount).toBe(2);

    await fileService.deleteFilePermanent(
      String(file2.id),
      String(mockUser._id)
    );
    objectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
    expect(objectCount).toBe(1);

    await fileService.deleteFilePermanent(
      String(file3.id),
      String(mockUser._id)
    );
    objectCount = await testMinioClient
      .listObjectsV2("file", "", true)
      .reduce((count) => count + 1, 0);
    expect(objectCount).toBe(0);
  });
});
