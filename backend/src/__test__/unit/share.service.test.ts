import { PermissionService } from "../../services/permission.service";
import { ShareService } from "../../services/share.service";
import {
  createTestUser,
  createTestFolder,
  createTestFile,
  createSharedAccess,
  getSharedAccessForResource,
} from "../utils/permission.util";
import { IUser } from "../../models/User.model";
import { IFolder } from "../../models/Folder.model";
import mongoose from "mongoose";
import { PermissionDetail } from "../../types/share.types";

// Mock nanoid to avoid ESM import issues
let nanoidCounter = 0;
jest.mock("nanoid", () => ({
  nanoid: jest.fn(() => `mocked-nanoid-token-${++nanoidCounter}`),
}));

describe("Share Service Tests", () => {
  let permissionService: PermissionService;
  let shareService: ShareService;
  let owner: IUser;
  let user1: IUser;
  let user2: IUser;
  let rootFolder: IFolder;
  let childFolder: IFolder;
  let grandchildFolder: IFolder;

  beforeEach(async () => {
    permissionService = new PermissionService();
    shareService = new ShareService(permissionService);

    // 创建测试用户
    owner = await createTestUser("Owner", "owner@example.com");
    user1 = await createTestUser("User1", "user1@example.com");
    user2 = await createTestUser("User2", "user2@example.com");

    // 创建文件夹层级结构: root -> child -> grandchild
    rootFolder = await createTestFolder(String(owner._id), "RootFolder");
    childFolder = await createTestFolder(
      String(owner._id),
      "ChildFolder",
      String(rootFolder._id),
      [rootFolder._id],
    );
    grandchildFolder = await createTestFolder(
      String(owner._id),
      "GrandchildFolder",
      String(childFolder._id),
      [rootFolder._id, childFolder._id],
    );
  });

  describe("ACL Management Operations", () => {
    it("should share resource with users", async () => {
      await shareService.shareWithUsers({
        actorId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        resourceName: "RootFolder",
        targetUserIds: [String(user1._id), String(user2._id)],
        role: "viewer",
      });

      const permissions = await getSharedAccessForResource(
        String(rootFolder._id),
      );
      expect(permissions).toHaveLength(2);

      const user1Permission = permissions.find(
        (p) => p.sharedWith.toString() === String(user1._id),
      );
      expect(user1Permission).toBeDefined();
      expect(user1Permission?.role).toBe("viewer");
    });

    it("should update existing permission when sharing again", async () => {
      // 第一次分享，给 viewer 权限
      await shareService.shareWithUsers({
        actorId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        resourceName: "RootFolder",
        targetUserIds: [String(user1._id)],
        role: "viewer",
      });

      // 第二次分享，升级为 editor 权限
      await shareService.shareWithUsers({
        actorId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        resourceName: "RootFolder",
        targetUserIds: [String(user1._id)],
        role: "editor",
      });

      const permissions = await getSharedAccessForResource(
        String(rootFolder._id),
      );
      expect(permissions).toHaveLength(1);
      expect(permissions[0].role).toBe("editor");
    });

    it("should remove permission", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      await shareService.unshareWithUser({
        actorId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        targetUserId: String(user1._id),
      });

      const permissions = await getSharedAccessForResource(
        String(rootFolder._id),
      );
      expect(permissions).toHaveLength(0);
    });

    it("should change permission role", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      await shareService.updateUserShareRole({
        actorId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        targetUserId: String(user1._id),
        newRole: "editor",
      });

      const permissions = await getSharedAccessForResource(
        String(rootFolder._id),
      );
      expect(permissions[0].role).toBe("editor");
    });

    it("should deny sharing when requester is not owner", async () => {
      await expect(
        shareService.shareWithUsers({
          actorId: String(user1._id),
          resourceId: String(rootFolder._id),
          resourceType: "Folder",
          resourceName: "RootFolder",
          targetUserIds: [String(user2._id)],
          role: "viewer",
        }),
      ).rejects.toThrow("Permission denied");
    });

    it("should deny removing permission when requester is not owner", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user2._id),
        "viewer",
      );

      await expect(
        shareService.unshareWithUser({
          actorId: String(user1._id),
          resourceId: String(rootFolder._id),
          resourceType: "Folder",
          targetUserId: String(user2._id),
        }),
      ).rejects.toThrow("Permission denied");
    });
  });

  describe("Get Resource Permissions", () => {
    it("should get all permissions for a resource", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user2._id),
        "viewer",
      );

      const result = await shareService.getResourcePermissions(
        String(owner._id),
        String(rootFolder._id),
        "Folder",
      );

      expect(result.owner).toBeDefined();
      expect(result.permissions).toHaveLength(2);
    });

    it("should include inherited permissions", async () => {
      // Root 分享给 user1
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      // Child 分享给 user2
      await createSharedAccess(
        String(childFolder._id),
        "Folder",
        String(owner._id),
        String(user2._id),
        "viewer",
      );

      // 查看 child 的权限，应包含继承的 root 权限
      const result = await shareService.getResourcePermissions(
        String(owner._id),
        String(childFolder._id),
        "Folder",
      );

      const inheritedPerm = result.permissions.find(
        (p: PermissionDetail) => p.isInherited,
      );
      const directPerm = result.permissions.find(
        (p: PermissionDetail) => !p.isInherited,
      );

      expect(inheritedPerm).toBeDefined();
      expect(inheritedPerm?.inheritedFrom?.resourceName).toBe("RootFolder");
      expect(directPerm).toBeDefined();
    });
  });

  describe("List Shared With Me", () => {
    it("should list all resources shared with user", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      const file = await createTestFile(
        String(owner._id),
        String(rootFolder._id),
        "shared.txt",
        [rootFolder._id],
      );

      await createSharedAccess(
        String(file._id),
        "File",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      const result = await shareService.listSharedWithMe({
        userId: String(user1._id),
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("should filter by resource type", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      const file = await createTestFile(
        String(owner._id),
        String(rootFolder._id),
        "shared.txt",
        [rootFolder._id],
      );

      await createSharedAccess(
        String(file._id),
        "File",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      const result = await shareService.listSharedWithMe({
        userId: String(user1._id),
        page: 1,
        limit: 10,
        resourceType: "Folder",
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].resourceType).toBe("Folder");
    });

    it("should exclude expired permissions", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
        pastDate,
      );

      const result = await shareService.listSharedWithMe({
        userId: String(user1._id),
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(0);
    });

    it("should paginate results correctly", async () => {
      // 创建 5 个文件夹并分享给 user1
      for (let i = 0; i < 5; i++) {
        const folder = await createTestFolder(String(owner._id), `Folder${i}`);
        await createSharedAccess(
          String(folder._id),
          "Folder",
          String(owner._id),
          String(user1._id),
          "viewer",
        );
      }

      const page1 = await shareService.listSharedWithMe({
        userId: String(user1._id),
        page: 1,
        limit: 3,
      });

      const page2 = await shareService.listSharedWithMe({
        userId: String(user1._id),
        page: 2,
        limit: 3,
      });

      expect(page1.items).toHaveLength(3);
      expect(page2.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page2.total).toBe(5);
    });
  });
});
