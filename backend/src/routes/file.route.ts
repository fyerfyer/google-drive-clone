import { Router } from "express";
import { jwtAuth } from "../middlewares/auth.middleware";
import { FileController } from "../controllers/file.controller";
import { requireAccess } from "../middlewares/permission.middleware";
import { PermissionService } from "../services/permission.service";

export function createFileRouter(
  fileController: FileController,
  permissionService: PermissionService,
) {
  const router = Router();

  // OnlyOffice 文档服务器通过查询字符串中的令牌获取文件内容
  // 路由 CORS 在 app.ts 中处理
  router.get(
    "/:fileId/office-content",
    fileController.serveOfficeContent.bind(fileController),
  );

  // OnlyOffice Document Server 保存回调
  // 当用户在 OnlyOffice 中保存文档时，Document Server POST 到此端点
  router.post(
    "/:fileId/office-callback",
    fileController.handleOfficeCallback.bind(fileController),
  );

  router.use(jwtAuth);

  // 在上传文件成功后保存 record
  router.post("/", fileController.createFile.bind(fileController));

  router.post("/create", fileController.createBlankFile.bind(fileController));

  router.get(
    "/:fileId/download",
    requireAccess(permissionService, "viewer", { resourceType: "File" }),
    fileController.downloadFile.bind(fileController),
  );

  router.get(
    "/:fileId/content",
    requireAccess(permissionService, "viewer", { resourceType: "File" }),
    fileController.getFileContent.bind(fileController),
  );

  router.put(
    "/:fileId/content",
    requireAccess(permissionService, "editor", { resourceType: "File" }),
    fileController.updateFileContent.bind(fileController),
  );

  router.get(
    "/:fileId/preview",
    requireAccess(permissionService, "viewer", { resourceType: "File" }),
    fileController.previewFile.bind(fileController),
  );

  router.get(
    "/:fileId/preview-url",
    requireAccess(permissionService, "viewer", { resourceType: "File" }),
    fileController.getPreviewUrl.bind(fileController),
  );

  // OnlyOffice 获取文件内容
  router.get(
    "/:fileId/office-url",
    requireAccess(permissionService, "viewer", { resourceType: "File" }),
    fileController.getOfficeContentUrl.bind(fileController),
  );

  router.patch(
    "/:fileId/rename",
    requireAccess(permissionService, "editor", { resourceType: "File" }),
    fileController.renameFile.bind(fileController),
  );

  router.patch(
    "/:fileId/move",
    requireAccess(permissionService, "editor", { resourceType: "File" }),
    fileController.moveFile.bind(fileController),
  );

  router.patch(
    "/:fileId/star",
    requireAccess(permissionService, "viewer", { resourceType: "File" }),
    fileController.starFile.bind(fileController),
  );

  router.patch(
    "/:fileId/unstar",
    requireAccess(permissionService, "viewer", { resourceType: "File" }),
    fileController.unstarFile.bind(fileController),
  );

  router.post(
    "/:fileId/trash",
    requireAccess(permissionService, "editor", { resourceType: "File" }),
    fileController.trashFile.bind(fileController),
  );

  router.post(
    "/:fileId/restore",
    requireAccess(permissionService, "editor", { resourceType: "File" }),
    fileController.restoreFile.bind(fileController),
  );

  router.delete(
    "/:fileId",
    requireAccess(permissionService, "owner", { resourceType: "File" }),
    fileController.deleteFilePermanent.bind(fileController),
  );

  // Special views
  router.get(
    "/view/starred",
    fileController.getStarredFiles.bind(fileController),
  );
  router.get(
    "/view/trashed",
    fileController.getTrashedFiles.bind(fileController),
  );
  router.get(
    "/view/recent",
    fileController.getRecentFiles.bind(fileController),
  );
  router.get("/view/all", fileController.getAllUserFiles.bind(fileController));

  return router;
}
