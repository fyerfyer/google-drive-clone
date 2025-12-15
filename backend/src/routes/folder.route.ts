import { Router } from "express";
import { FolderController } from "../controllers/folder.controller";
import { jwtAuth } from "../middlewares/auth.middleware";

export function createFolderRouter(folderController: FolderController) {
  const router = Router();
  router.use(jwtAuth);

  router.post("/create", folderController.createFolder.bind(folderController));

  router.patch(
    "/:folderId/move",
    folderController.moveFolder.bind(folderController)
  );

  router.patch(
    "/:folderId/rename",
    folderController.renameFolder.bind(folderController)
  );

  router.post(
    "/:folderId/trash",
    folderController.trashFolder.bind(folderController)
  );

  router.post(
    "/:folderId/restore",
    folderController.restoreFolder.bind(folderController)
  );

  router.delete(
    "/:folderId",
    folderController.deleteFolderPermanent.bind(folderController)
  );

  router.patch(
    "/:folderId/star",
    folderController.starFolder.bind(folderController)
  );

  router.patch(
    "/:folderId/unstar",
    folderController.unstarFolder.bind(folderController)
  );

  router.get(
    "/:folderId/content",
    folderController.getFolderContent.bind(folderController)
  );

  // Special views
  router.get(
    "/view/starred",
    folderController.getStarredFolders.bind(folderController)
  );
  router.get(
    "/view/trashed",
    folderController.getTrashedFolders.bind(folderController)
  );
  router.get(
    "/view/recent",
    folderController.getRecentFolders.bind(folderController)
  );

  router.get(
    "/:folderId/path",
    folderController.getFolderPath.bind(folderController)
  );

  return router;
}
