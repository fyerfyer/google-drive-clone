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
  router.use(jwtAuth);

  // 在上传文件成功后保存 record
  router.post("/", fileController.createFile.bind(fileController));

  router.get(
    "/:fileId/download",
    requireAccess(permissionService, "viewer", { resourceType: "File" }),
    fileController.downloadFile.bind(fileController),
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
