import { Router } from "express";
import { ShareController } from "../controllers/share.controller";
import { jwtAuth } from "../middlewares/auth.middleware";
import { generalLimiter } from "../middlewares/rateLimiter";

export function createShareRouter(shareController: ShareController) {
  const router = Router();

  router.get(
    "/public/:resourceType/:token",
    shareController.getSharedByToken.bind(shareController),
  );

  router.get(
    "/public/file/:token/download",
    shareController.downloadSharedFile.bind(shareController),
  );

  router.get(
    "/public/file/:token/preview",
    shareController.previewSharedFile.bind(shareController),
  );

  router.get(
    "/public/file/:token/preview-url",
    shareController.getSharedFilePreviewUrl.bind(shareController),
  );

  router.get(
    "/public/folder/:token/content",
    shareController.getSharedFolderContent.bind(shareController),
  );

  router.get(
    "/public/folder/:token/path/:folderId",
    shareController.getSharedFolderPath.bind(shareController),
  );

  router.post(
    "/public/:resourceType/:token/save",
    jwtAuth,
    shareController.saveSharedResource.bind(shareController),
  );

  // 以下路由需要认证
  router.use(jwtAuth);
  router.use(generalLimiter);

  router.post("/resource", shareController.shareResource.bind(shareController));

  router.get(
    "/shared-with-me",
    shareController.listSharedWithMe.bind(shareController),
  );

  router.post(
    "/:resourceType/:resourceId/save",
    shareController.saveDirectSharedResource.bind(shareController),
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

  router.post(
    "/:resourceId/links",
    shareController.createShareLink.bind(shareController),
  );

  router.get(
    "/:resourceId/links",
    shareController.listShareLinks.bind(shareController),
  );

  router.patch(
    "/links/:linkId",
    shareController.updateShareLink.bind(shareController),
  );

  router.delete(
    "/links/:linkId",
    shareController.revokeShareLink.bind(shareController),
  );

  // 重新生成链接 Token
  router.post(
    "/links/:linkId/rotate",
    shareController.rotateShareLinkToken.bind(shareController),
  );

  return router;
}
