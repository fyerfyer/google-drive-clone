import { Router } from "express";
import { ShareController } from "../controllers/share.controller";
import { jwtAuth } from "../middlewares/auth.middleware";

export function createShareRouter(shareController: ShareController) {
  const router = Router();
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
