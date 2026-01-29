import { Router } from "express";
import { ShareController } from "../controllers/share.controller";
import { jwtAuth } from "../middlewares/auth.middleware";

export function createShareRouter(shareController: ShareController) {
  const router = Router();

  // Public routes - access shared resources by token (no auth required)
  router.get(
    "/public/:resourceType/:token",
    shareController.getSharedByToken.bind(shareController),
  );

  // Public file download via share token
  router.get(
    "/public/file/:token/download",
    shareController.downloadSharedFile.bind(shareController),
  );

  // Public file preview via share token
  router.get(
    "/public/file/:token/preview",
    shareController.previewSharedFile.bind(shareController),
  );

  // Public file preview URL via share token
  router.get(
    "/public/file/:token/preview-url",
    shareController.getSharedFilePreviewUrl.bind(shareController),
  );

  // Public folder content via share token
  router.get(
    "/public/folder/:token/content",
    shareController.getSharedFolderContent.bind(shareController),
  );

  // Public folder path/breadcrumbs via share token
  router.get(
    "/public/folder/:token/path/:folderId",
    shareController.getSharedFolderPath.bind(shareController),
  );

  // All other routes require authentication
  router.use(jwtAuth);

  router.post("/resource", shareController.shareResource.bind(shareController));

  router.get(
    "/shared-with-me",
    shareController.listSharedWithMe.bind(shareController),
  );

  router.get(
    "/:resourceId/permissions",
    shareController.getResourcePermissions.bind(shareController),
  );

  router.delete(
    "/:resourceId/permissions/:targetUserId",
    shareController.removePermission.bind(shareController),
  );

  router.patch(
    "/:resourceId/permissions/:targetUserId",
    shareController.changePermission.bind(shareController),
  );

  router.patch(
    "/:resourceId/link",
    shareController.updateLinkShare.bind(shareController),
  );

  return router;
}
