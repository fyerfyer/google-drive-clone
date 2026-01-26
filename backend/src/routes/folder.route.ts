import { Router } from "express";
import { FolderController } from "../controllers/folder.controller";
import { jwtAuth } from "../middlewares/auth.middleware";
import { requireAccess } from "../middlewares/permission.middleware";
import { PermissionService } from "../services/permission.service";

export function createFolderRouter(
  folderController: FolderController,
  permissionService: PermissionService,
) {
  const router = Router();
  router.use(jwtAuth);

  router.post("/create", folderController.createFolder.bind(folderController));

  router.patch(
    "/:folderId/move",
    requireAccess(permissionService, "editor", { resourceType: "Folder" }),
    folderController.moveFolder.bind(folderController),
  );

  router.patch(
    "/:folderId/rename",
    requireAccess(permissionService, "editor", { resourceType: "Folder" }),
    folderController.renameFolder.bind(folderController),
  );

  router.post(
    "/:folderId/trash",
    requireAccess(permissionService, "editor", { resourceType: "Folder" }),
    folderController.trashFolder.bind(folderController),
  );

  router.post(
    "/:folderId/restore",
    requireAccess(permissionService, "editor", { resourceType: "Folder" }),
    folderController.restoreFolder.bind(folderController),
  );

  router.delete(
    "/:folderId",
    requireAccess(permissionService, "owner", { resourceType: "Folder" }),
    folderController.deleteFolderPermanent.bind(folderController),
  );

  router.patch(
    "/:folderId/star",
    requireAccess(permissionService, "viewer", { resourceType: "Folder" }),
    folderController.starFolder.bind(folderController),
  );

  router.patch(
    "/:folderId/unstar",
    requireAccess(permissionService, "viewer", { resourceType: "Folder" }),
    folderController.unstarFolder.bind(folderController),
  );

  router.get(
    "/:folderId/content",
    requireAccess(permissionService, "viewer", { resourceType: "Folder" }),
    folderController.getFolderContent.bind(folderController),
  );

  // Special views
  router.get(
    "/view/starred",
    folderController.getStarredFolders.bind(folderController),
  );
  router.get(
    "/view/trashed",
    folderController.getTrashedFolders.bind(folderController),
  );
  router.get(
    "/view/recent",
    folderController.getRecentFolders.bind(folderController),
  );

  router.get(
    "/:folderId/path",
    requireAccess(permissionService, "viewer", { resourceType: "Folder" }),
    folderController.getFolderPath.bind(folderController),
  );

  return router;
}
