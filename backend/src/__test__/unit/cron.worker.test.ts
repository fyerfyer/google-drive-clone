import Folder, { IFolder } from "../../models/Folder.model";
import File from "../../models/File.model";
import User, { IUser } from "../../models/User.model";
import { FileService } from "../../services/file.service";
import { maintainanceQueue } from "../../lib/queue/queue";
import {
  QUEUE_NAMES,
  QUEUE_TASKS,
  QUEUE_ACTIONS,
} from "../../types/model.types";
import { uploadTestFile } from "../utils/file.util";
import { redisClient } from "../../config/redis";
import { QueueEvents } from "bullmq";

describe("Test cron worker", () => {
  let fileService: FileService;
  let mockUser: IUser;
  let parentFolder: IFolder;
  let queueEvents: QueueEvents;

  beforeAll(async () => {
    queueEvents = new QueueEvents(QUEUE_NAMES.MAINTAINANCE, {
      connection: redisClient,
    });
  });

  afterAll(async () => {
    await queueEvents.close();
  });

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

    await maintainanceQueue.drain();
  });

  it("Should cleanup expired trashed files and folders", async () => {
    // Create files and folders
    const file1 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "old-file.txt",
      "test content",
      "old-hash"
    );

    const folder1 = await Folder.create({
      name: "OldFolder",
      user: mockUser._id,
      parent: parentFolder._id,
      ancestors: [parentFolder._id],
      isTrashed: false,
    });

    // Trash them
    await fileService.trashFile(String(file1.id), String(mockUser._id));
    await Folder.updateOne(
      { _id: folder1._id },
      { isTrashed: true, trashedAt: new Date() }
    );

    // Manually set trashedAt to more than 30 days ago
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await File.updateOne({ _id: file1.id }, { trashedAt: thirtyOneDaysAgo });
    await Folder.updateOne(
      { _id: folder1._id },
      { trashedAt: thirtyOneDaysAgo }
    );

    // Verify they exist before cleanup
    let fileInDb = await File.findById(String(file1.id));
    let folderInDb = await Folder.findById(folder1._id);
    expect(fileInDb).toBeDefined();
    expect(folderInDb).toBeDefined();

    // Run cleanup job
    const job = await maintainanceQueue.add(QUEUE_TASKS.CLEANUP_TRASH, {
      action: QUEUE_ACTIONS.EMPTY_TRASH,
    });

    await job.waitUntilFinished(queueEvents, 30000);

    // Verify they were deleted
    fileInDb = await File.findById(String(file1.id));
    folderInDb = await Folder.findById(folder1._id);
    expect(fileInDb).toBeNull();
    expect(folderInDb).toBeNull();
  });

  it("Should not cleanup files trashed less than 30 days ago", async () => {
    const file = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "recent-file.txt",
      "test content",
      "recent-hash"
    );

    await fileService.trashFile(String(file.id), String(mockUser._id));

    // Set trashedAt to 20 days ago (not expired yet)
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await File.updateOne({ _id: file.id }, { trashedAt: twentyDaysAgo });

    const job = await maintainanceQueue.add(QUEUE_TASKS.CLEANUP_TRASH, {
      action: QUEUE_ACTIONS.EMPTY_TRASH,
    });

    await job.waitUntilFinished(queueEvents, 30000);

    // Verify file still exists
    const fileInDb = await File.findById(String(file.id));
    expect(fileInDb).toBeDefined();
    expect(fileInDb?.isTrashed).toBe(true);
  });

  it("Should handle empty trash cleanup gracefully", async () => {
    // Don't create any trashed items
    const job = await maintainanceQueue.add(QUEUE_TASKS.CLEANUP_TRASH, {
      action: QUEUE_ACTIONS.EMPTY_TRASH,
    });

    // Should complete without errors
    await expect(
      job.waitUntilFinished(queueEvents, 30000)
    ).resolves.toBeDefined();
  });

  it("Should cleanup multiple expired items from different users", async () => {
    const mockUser2 = await User.create({
      name: "testuser2",
      email: "test2@example.com",
      password: "hashedpassword",
      storageUsage: 0,
      storageQuota: 1024 * 1024 * 1024,
    });

    const folder2 = await Folder.create({
      name: "User2Folder",
      user: mockUser2._id,
      parent: null,
      ancestors: [],
      isTrashed: false,
    });

    const file1 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "user1-file.txt",
      "test content",
      "user1-hash"
    );

    const file2 = await uploadTestFile(
      fileService,
      String(mockUser2._id),
      String(folder2._id),
      "user2-file.txt",
      "test content",
      "user2-hash"
    );

    await fileService.trashFile(String(file1.id), String(mockUser._id));
    await fileService.trashFile(String(file2.id), String(mockUser2._id));

    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await File.updateMany(
      { _id: { $in: [file1.id, file2.id] } },
      { trashedAt: thirtyOneDaysAgo }
    );

    const job = await maintainanceQueue.add(QUEUE_TASKS.CLEANUP_TRASH, {
      action: QUEUE_ACTIONS.EMPTY_TRASH,
    });

    await job.waitUntilFinished(queueEvents, 30000);

    const file1InDb = await File.findById(String(file1.id));
    const file2InDb = await File.findById(String(file2.id));
    expect(file1InDb).toBeNull();
    expect(file2InDb).toBeNull();
  });

  it("Should update user storage usage after cleanup", async () => {
    const file = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(parentFolder._id),
      "storage-test.txt",
      "test content with some size",
      "storage-hash"
    );

    const initialUser = await User.findById(mockUser._id);
    const initialStorage = initialUser?.storageUsage || 0;
    expect(initialStorage).toBeGreaterThan(0);

    await fileService.trashFile(String(file.id), String(mockUser._id));

    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await File.updateOne({ _id: file.id }, { trashedAt: thirtyOneDaysAgo });

    const job = await maintainanceQueue.add(QUEUE_TASKS.CLEANUP_TRASH, {
      action: QUEUE_ACTIONS.EMPTY_TRASH,
    });

    await job.waitUntilFinished(queueEvents, 30000);

    const finalUser = await User.findById(mockUser._id);
    const finalStorage = finalUser?.storageUsage || 0;
    expect(finalStorage).toBeLessThan(initialStorage);
  });

  it("Should verify Redis connection is working", async () => {
    const pingResult = await redisClient.ping();
    expect(pingResult).toBe("PONG");
  });

  it("Should verify maintenance queue is working", async () => {
    const jobCounts = await maintainanceQueue.getJobCounts();
    expect(jobCounts).toBeDefined();
    expect(typeof jobCounts.waiting).toBe("number");
  });

  it("Should handle cleanup job with folders containing files", async () => {
    const folder = await Folder.create({
      name: "FolderWithFiles",
      user: mockUser._id,
      parent: parentFolder._id,
      ancestors: [parentFolder._id],
      isTrashed: false,
    });

    const file1 = await uploadTestFile(
      fileService,
      String(mockUser._id),
      String(folder._id),
      "file-in-folder.txt",
      "test content",
      "folder-file-hash"
    );

    // Trash the folder (which should trash all files inside)
    await Folder.updateOne(
      { _id: folder._id },
      { isTrashed: true, trashedAt: new Date() }
    );
    await File.updateOne(
      { _id: file1.id },
      { isTrashed: true, trashedAt: new Date() }
    );

    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await Folder.updateOne(
      { _id: folder._id },
      { trashedAt: thirtyOneDaysAgo }
    );
    await File.updateOne({ _id: file1.id }, { trashedAt: thirtyOneDaysAgo });

    const job = await maintainanceQueue.add(QUEUE_TASKS.CLEANUP_TRASH, {
      action: QUEUE_ACTIONS.EMPTY_TRASH,
    });

    await job.waitUntilFinished(queueEvents, 30000);

    const folderInDb = await Folder.findById(folder._id);
    const fileInDb = await File.findById(String(file1.id));
    expect(folderInDb).toBeNull();
    expect(fileInDb).toBeNull();
  });
});
