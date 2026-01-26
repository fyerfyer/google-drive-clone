import { PermissionService } from "../../services/permission.service";
import {
  createTestUser,
  createTestFolder,
  createTestFile,
  createSharedAccess,
  setLinkShare,
  getSharedAccessForResource,
} from "../utils/permission.util";
import { IUser } from "../../models/User.model";
import { IFolder } from "../../models/Folder.model";
import mongoose from "mongoose";

// Mock nanoid to avoid ESM import issues
let nanoidCounter = 0;
jest.mock("nanoid", () => ({
  nanoid: jest.fn(() => `mocked-nanoid-token-${++nanoidCounter}`),
}));

describe("Permission Service Tests", () => {
  let permissionService: PermissionService;
  let owner: IUser;
  let user1: IUser;
  let user2: IUser;
  let rootFolder: IFolder;
  let childFolder: IFolder;
  let grandchildFolder: IFolder;

  beforeEach(async () => {
    permissionService = new PermissionService();

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

  describe("ACL Layer Tests", () => {
    it("should allow owner full access", async () => {
      const hasAccess = await permissionService.checkPermission({
        userId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "owner",
      });

      expect(hasAccess).toBe(true);
    });

    it("should deny access when no permission exists", async () => {
      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(false);
    });

    it("should grant direct ACL permission", async () => {
      // 直接授予 user1 viewer 权限
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(true);
    });

    it("should check role hierarchy correctly", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      const hasViewerAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });
      expect(hasViewerAccess).toBe(true);

      const hasEditorAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "editor",
      });
      expect(hasEditorAccess).toBe(false);
    });

    it("should deny access when permission expired", async () => {
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

      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(false);
    });

    it("should allow access when permission not expired", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
        futureDate,
      );

      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(true);
    });
  });

  describe("Policy Layer Tests", () => {
    it("should allow public link access with valid token", async () => {
      const token = "test-token-123";
      await setLinkShare(String(rootFolder._id), "Folder", {
        enableLinkSharing: true,
        role: "viewer",
        scope: "domain",
        token,
      });

      const hasAccess = await permissionService.checkPermission({
        userId: null,
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
        token,
      });

      expect(hasAccess).toBe(true);
    });

    it("should deny public link access with invalid token", async () => {
      const token = "test-token-123";
      await setLinkShare(String(rootFolder._id), "Folder", {
        enableLinkSharing: true,
        role: "viewer",
        scope: "domain",
        token,
      });

      const hasAccess = await permissionService.checkPermission({
        userId: null,
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
        token: "wrong-token",
      });

      expect(hasAccess).toBe(false);
    });

    it("should allow anyone access without token when scope is anyone", async () => {
      await setLinkShare(String(rootFolder._id), "Folder", {
        enableLinkSharing: true,
        role: "viewer",
        scope: "anyone",
        token: "some-token",
      });

      const hasAccess = await permissionService.checkPermission({
        userId: null,
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(true);
    });

    it("should deny access when link sharing disabled", async () => {
      await setLinkShare(String(rootFolder._id), "Folder", {
        enableLinkSharing: false,
        role: "viewer",
        scope: "anyone",
        token: "some-token",
      });

      const hasAccess = await permissionService.checkPermission({
        userId: null,
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(false);
    });

    it("should deny access when link expired", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await setLinkShare(String(rootFolder._id), "Folder", {
        enableLinkSharing: true,
        role: "viewer",
        scope: "anyone",
        expiresAt: pastDate,
      });

      const hasAccess = await permissionService.checkPermission({
        userId: null,
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(false);
    });

    it("should check link role hierarchy", async () => {
      await setLinkShare(String(rootFolder._id), "Folder", {
        enableLinkSharing: true,
        role: "viewer",
        scope: "anyone",
      });

      const hasViewerAccess = await permissionService.checkPermission({
        userId: null,
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });
      expect(hasViewerAccess).toBe(true);

      const hasEditorAccess = await permissionService.checkPermission({
        userId: null,
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "editor",
      });
      expect(hasEditorAccess).toBe(false);
    });
  });

  describe("Permission Inheritance Tests", () => {
    it("should inherit ACL permission from parent folder", async () => {
      // 给 user1 在 root folder 上授予 viewer 权限
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      // user1 应该能访问 child folder
      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(childFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(true);

      const denyAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(grandchildFolder._id),
        resourceType: "Folder",
        requireRole: "editor",
      });

      expect(denyAccess).toBe(false);
    });

    it("should inherit ACL permission from grandparent folder", async () => {
      // 给 user1 在 root folder 上授予 editor 权限
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      // user1 应该能以 editor 身份访问 grandchild folder
      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(grandchildFolder._id),
        resourceType: "Folder",
        requireRole: "editor",
      });

      expect(hasAccess).toBe(true);
    });

    it("should use maximum permission from inheritance chain", async () => {
      // 在 root folder 给 user1 viewer 权限
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      // 在 child folder 给 user1 editor 权限
      await createSharedAccess(
        String(childFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      const role = await permissionService.getUserRoleForResource(
        String(user1._id),
        String(grandchildFolder._id),
        "Folder",
      );

      expect(role).toBe("editor");
    });

    it("should inherit link share from parent folder", async () => {
      const token = "parent-token";
      await setLinkShare(String(rootFolder._id), "Folder", {
        enableLinkSharing: true,
        role: "viewer",
        scope: "domain",
        token,
      });

      // 使用 parent 的 token 应该能访问 child folder
      const hasAccess = await permissionService.checkPermission({
        userId: null,
        resourceId: String(childFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
        token,
      });

      expect(hasAccess).toBe(true);
    });

    it("should inherit public link from ancestor", async () => {
      await setLinkShare(String(rootFolder._id), "Folder", {
        enableLinkSharing: true,
        role: "viewer",
        scope: "anyone",
      });

      // 无需 token 应该能访问 grandchild folder
      const hasAccess = await permissionService.checkPermission({
        userId: null,
        resourceId: String(grandchildFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(true);
    });

    it("should work with files inheriting folder permissions", async () => {
      const file = await createTestFile(
        String(owner._id),
        String(childFolder._id),
        "test.txt",
        [rootFolder._id, childFolder._id],
      );

      // 在 root folder 给 user1 viewer 权限
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(file._id),
        resourceType: "File",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(true);
    });
  });

  describe("Permission Management Operations", () => {
    it("should share resource with users", async () => {
      await permissionService.shareResource({
        requesterId: String(owner._id),
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
      await permissionService.shareResource({
        requesterId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        resourceName: "RootFolder",
        targetUserIds: [String(user1._id)],
        role: "viewer",
      });

      // 第二次分享，升级为 editor 权限
      await permissionService.shareResource({
        requesterId: String(owner._id),
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

      await permissionService.removePermission({
        requesterId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        targetUserId: String(user1._id),
      });

      const permissions = await getSharedAccessForResource(
        String(rootFolder._id),
      );
      expect(permissions).toHaveLength(0);

      const denyAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(denyAccess).toBe(false);
    });

    it("should change permission role", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      await permissionService.changePermission({
        requesterId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        targetUserId: String(user1._id),
        newRole: "editor",
      });

      const permissions = await getSharedAccessForResource(
        String(rootFolder._id),
      );
      expect(permissions).toHaveLength(1);
      expect(permissions[0].role).toBe("editor");
    });

    it("should deny sharing when requester is not owner", async () => {
      await expect(
        permissionService.shareResource({
          requesterId: String(user1._id),
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
        permissionService.removePermission({
          requesterId: String(user1._id),
          resourceId: String(rootFolder._id),
          resourceType: "Folder",
          targetUserId: String(user2._id),
        }),
      ).rejects.toThrow("Permission denied");
    });

    it("should update link share configuration", async () => {
      const result = await permissionService.updateLinkShare({
        userId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        linkShareConfig: {
          enableLinkSharing: true,
          role: "viewer",
          scope: "anyone",
        },
      });

      expect(result.token).toBeDefined();
      expect(result.linkShareConfig.enableLinkSharing).toBe(true);
      expect(result.linkShareConfig.role).toBe("viewer");
      expect(result.linkShareConfig.scope).toBe("anyone");
    });

    it("should reset token when requested", async () => {
      // 第一次创建 link share
      const result1 = await permissionService.updateLinkShare({
        userId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        linkShareConfig: {
          enableLinkSharing: true,
          role: "viewer",
          scope: "domain",
        },
      });

      const oldToken = result1.token;

      // 重置 token
      const result2 = await permissionService.updateLinkShare({
        userId: String(owner._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        linkShareConfig: {
          enableLinkSharing: true,
          role: "viewer",
          scope: "domain",
          token: "RESET",
        },
      });

      expect(result2.token).not.toBe(oldToken);
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

      const result = await permissionService.getResourcePermissions(
        String(rootFolder._id),
        "Folder",
      );

      expect(result.owner).toBeDefined();
      expect(result.owner?.email).toBe("owner@example.com");
      expect(result.permissions).toHaveLength(2);
    });

    it("should mark inherited permissions correctly", async () => {
      // 在 parent 上给 user1 权限
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      // 在 child 上给 user2 权限
      await createSharedAccess(
        String(childFolder._id),
        "Folder",
        String(owner._id),
        String(user2._id),
        "editor",
      );

      const result = await permissionService.getResourcePermissions(
        String(childFolder._id),
        "Folder",
      );

      const user1Permission = result.permissions.find(
        (p) => p.userId.toString() === String(user1._id),
      );
      const user2Permission = result.permissions.find(
        (p) => p.userId.toString() === String(user2._id),
      );

      expect(user1Permission?.isInherited).toBe(true);
      expect(user1Permission?.inheritedFrom?.resourceName).toBe("RootFolder");
      expect(user2Permission?.isInherited).toBe(false);
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

      const result = await permissionService.listSharedWithMe({
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

      const result = await permissionService.listSharedWithMe({
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

      const result = await permissionService.listSharedWithMe({
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

      const page1 = await permissionService.listSharedWithMe({
        userId: String(user1._id),
        page: 1,
        limit: 3,
      });

      const page2 = await permissionService.listSharedWithMe({
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

  describe("Combined Permission Tests (Max Rule)", () => {
    it("should use ACL permission when higher than link share", async () => {
      // Link share 给 viewer 权限
      await setLinkShare(String(rootFolder._id), "Folder", {
        enableLinkSharing: true,
        role: "viewer",
        scope: "anyone",
      });

      // ACL 给 user1 editor 权限
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      const role = await permissionService.getUserRoleForResource(
        String(user1._id),
        String(rootFolder._id),
        "Folder",
      );

      expect(role).toBe("editor");
    });

    it("should combine ACL and link share correctly", async () => {
      // 在 parent 给 link share viewer 权限
      await setLinkShare(String(rootFolder._id), "Folder", {
        enableLinkSharing: true,
        role: "viewer",
        scope: "anyone",
      });

      // 在 child 给 user1 editor 权限
      await createSharedAccess(
        String(childFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      // user1 访问 grandchild 应该得到 editor 权限（来自 child 的 ACL）
      const hasEditorAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(grandchildFolder._id),
        resourceType: "Folder",
        requireRole: "editor",
      });

      expect(hasEditorAccess).toBe(true);

      // 匿名用户访问 grandchild 应该得到 viewer 权限（来自 root 的 link share）
      const hasViewerAccess = await permissionService.checkPermission({
        userId: null,
        resourceId: String(grandchildFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasViewerAccess).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-existent resource", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(fakeId),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(false);
    });

    it("should handle null userId with no link share", async () => {
      const hasAccess = await permissionService.checkPermission({
        userId: null,
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(false);
    });

    it("should return null role when user has no access", async () => {
      const role = await permissionService.getUserRoleForResource(
        String(user1._id),
        String(rootFolder._id),
        "Folder",
      );

      expect(role).toBeNull();
    });

    // TODO: 当前实现不检查密码，这个测试验证当前行为
    // it("should handle resource with password protected link (not implemented)", async () => {
    //   await setLinkShare(String(rootFolder._id), "Folder", {
    //     enableLinkSharing: true,
    //     role: "viewer",
    //     scope: "domain",
    //     password: "secret123",
    //     token: "test-token",
    //   });

    //   // 有 token 但没有提供密码
    //   const hasAccess = await permissionService.checkPermission({
    //     userId: null,
    //     resourceId: String(rootFolder._id),
    //     resourceType: "Folder",
    //     requireRole: "viewer",
    //     token: "test-token",
    //   });
    //   expect(hasAccess).toBe(true);
    // });
  });
});
