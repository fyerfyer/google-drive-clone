import { PermissionService } from "../../services/permission.service";
import {
  createTestUser,
  createTestFolder,
  createTestFile,
  createSharedAccess,
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

    it("should deny access to non-owner without ACL", async () => {
      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(false);
    });

    it("should allow access with direct ACL", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(true);
    });

    it("should respect role hierarchy: editor > viewer", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      const canEdit = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(rootFolder._id),
        resourceType: "Folder",
        requireRole: "editor",
      });

      expect(canEdit).toBe(false);
    });

    it("should deny expired ACL access", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "editor",
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
  });

  describe("Permission Inheritance Tests", () => {
    it("should inherit permission from parent folder", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      // 检查子文件夹是否继承权限
      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(childFolder._id),
        resourceType: "Folder",
        requireRole: "editor",
      });

      expect(hasAccess).toBe(true);
    });

    it("should inherit permission through multiple levels", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      // 检查孙子文件夹是否继承权限
      const hasAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(grandchildFolder._id),
        resourceType: "Folder",
        requireRole: "viewer",
      });

      expect(hasAccess).toBe(true);
    });

    it("should use maximum role from inheritance chain", async () => {
      // Root: viewer
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "viewer",
      );

      // Child: editor
      await createSharedAccess(
        String(childFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      // Grandchild 应该获取最高权限 (editor)
      const hasEditorAccess = await permissionService.checkPermission({
        userId: String(user1._id),
        resourceId: String(grandchildFolder._id),
        resourceType: "Folder",
        requireRole: "editor",
      });

      expect(hasEditorAccess).toBe(true);
    });

    it("should inherit permissions for files in shared folder", async () => {
      await createSharedAccess(
        String(rootFolder._id),
        "Folder",
        String(owner._id),
        String(user1._id),
        "editor",
      );

      const file = await createTestFile(
        String(owner._id),
        String(rootFolder._id),
        "test.txt",
        [rootFolder._id],
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
  });
});
