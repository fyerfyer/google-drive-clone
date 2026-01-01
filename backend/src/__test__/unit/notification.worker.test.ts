import { Notification } from "../../models/Notification.model";
import User, { IUser } from "../../models/User.model";
import { notificationQueue } from "../../lib/queue/queue";
import {
  QUEUE_NAMES,
  QUEUE_TASKS,
  NOTIFICATION_TYPES,
} from "../../types/model.types";
import { redisClient } from "../../config/redis";
import { QueueEvents } from "bullmq";

describe("Test notification worker", () => {
  let mockUser1: IUser;
  let mockUser2: IUser;
  let queueEvents: QueueEvents;

  beforeAll(async () => {
    queueEvents = new QueueEvents(QUEUE_NAMES.NOTIFICATIONS, {
      connection: redisClient,
    });
  });

  afterAll(async () => {
    await queueEvents.close();
  });

  beforeEach(async () => {
    mockUser1 = await User.create({
      name: "sender",
      email: "sender@example.com",
      password: "hashedpassword",
      storageUsage: 0,
      storageQuota: 1024 * 1024 * 1024,
    });

    mockUser2 = await User.create({
      name: "recipient",
      email: "recipient@example.com",
      password: "hashedpassword",
      storageUsage: 0,
      storageQuota: 1024 * 1024 * 1024,
    });

    // Clean up queue before each test
    await notificationQueue.drain();
  });

  it("Should create notification for file shared event", async () => {
    const job = await notificationQueue.add(QUEUE_TASKS.SEND_SHARE, {
      type: NOTIFICATION_TYPES.FILE_SHARED,
      recipientId: String(mockUser2._id),
      senderId: String(mockUser1._id),
      data: {
        title: "File shared with you",
        items: [
          {
            resourceId: "file123",
            kind: "File",
          },
        ],
      },
    });

    // Wait for the job to complete
    await job.waitUntilFinished(queueEvents);

    // Verify notification was created in database
    const notifications = await Notification.find({
      recipient: mockUser2._id,
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe(NOTIFICATION_TYPES.FILE_SHARED);
    expect(notifications[0].sender?.toString()).toBe(String(mockUser1._id));
    expect(notifications[0].data.title).toBe("File shared with you");
    expect(notifications[0].data.items).toHaveLength(1);
    expect(notifications[0].isRead).toBe(false);
  });

  it("Should create notification for folder shared event", async () => {
    const job = await notificationQueue.add(QUEUE_TASKS.SEND_SHARE, {
      type: NOTIFICATION_TYPES.FOLDER_SHARED,
      recipientId: String(mockUser2._id),
      senderId: String(mockUser1._id),
      data: {
        title: "Folder shared with you",
        items: [
          {
            resourceId: "folder456",
            kind: "Folder",
          },
        ],
      },
    });

    await job.waitUntilFinished(queueEvents);

    const notifications = await Notification.find({
      recipient: mockUser2._id,
      type: NOTIFICATION_TYPES.FOLDER_SHARED,
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].sender?.toString()).toBe(String(mockUser1._id));
    expect(notifications[0].data.items?.[0].kind).toBe("Folder");
  });

  it("Should create notification for storage warning", async () => {
    const job = await notificationQueue.add(QUEUE_TASKS.SEND_SHARE, {
      type: NOTIFICATION_TYPES.STORAGE_WARNING,
      recipientId: String(mockUser2._id),
      senderId: undefined,
      data: {
        title: "Storage warning",
        storageUsage: 950 * 1024 * 1024,
        storageQuota: 1024 * 1024 * 1024,
      },
    });

    await job.waitUntilFinished(queueEvents);

    const notifications = await Notification.find({
      recipient: mockUser2._id,
      type: NOTIFICATION_TYPES.STORAGE_WARNING,
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].sender).toBeFalsy(); // Can be null or undefined
    expect(notifications[0].data.storageUsage).toBeDefined();
  });

  it("Should create multiple notifications for same recipient", async () => {
    const job1 = await notificationQueue.add(QUEUE_TASKS.SEND_SHARE, {
      type: NOTIFICATION_TYPES.FILE_SHARED,
      recipientId: String(mockUser2._id),
      senderId: String(mockUser1._id),
      data: {
        title: "First notification",
        items: [{ resourceId: "file1", kind: "File" }],
      },
    });

    const job2 = await notificationQueue.add(QUEUE_TASKS.SEND_SHARE, {
      type: NOTIFICATION_TYPES.FOLDER_SHARED,
      recipientId: String(mockUser2._id),
      senderId: String(mockUser1._id),
      data: {
        title: "Second notification",
        items: [{ resourceId: "folder1", kind: "Folder" }],
      },
    });

    await Promise.all([
      job1.waitUntilFinished(queueEvents),
      job2.waitUntilFinished(queueEvents),
    ]);

    const notifications = await Notification.find({
      recipient: mockUser2._id,
    });

    expect(notifications).toHaveLength(2);
  });

  it("Should handle notification with multiple resources", async () => {
    const job = await notificationQueue.add(QUEUE_TASKS.SEND_SHARE, {
      type: NOTIFICATION_TYPES.FILE_SHARED,
      recipientId: String(mockUser2._id),
      senderId: String(mockUser1._id),
      data: {
        title: "Multiple files shared",
        items: [
          { resourceId: "file1", kind: "File" },
          { resourceId: "file2", kind: "File" },
          { resourceId: "file3", kind: "File" },
        ],
      },
    });

    await job.waitUntilFinished(queueEvents);

    const notifications = await Notification.find({
      recipient: mockUser2._id,
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].data.items).toHaveLength(3);
  });

  it("Should verify Redis connection is working", async () => {
    const pingResult = await redisClient.ping();
    expect(pingResult).toBe("PONG");
  });

  it("Should verify queue is working", async () => {
    const jobCounts = await notificationQueue.getJobCounts();
    expect(jobCounts).toBeDefined();
    expect(typeof jobCounts.waiting).toBe("number");
  });
});
