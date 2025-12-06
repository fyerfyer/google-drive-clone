import { Router } from "express";
import { FolderController } from "../controllers/folder.controller";
import { jwtAuth } from "../middlewares/auth.middleware";

export function createFolderRouter(folderController: FolderController) {
  const router = Router();

  router.post(
    "/create",
    jwtAuth,
    folderController.createFolder.bind(folderController)
  );

  router.patch(
    "/:folderId/move",
    jwtAuth,
    folderController.moveFolder.bind(folderController)
  );

  router.patch(
    "/:folderId/rename",
    jwtAuth,
    folderController.renameFolder.bind(folderController)
  );

  router.post(
    "/:folderId/trash",
    jwtAuth,
    folderController.trashFolder.bind(folderController)
  );

  router.post(
    "/:folderId/restore",
    jwtAuth,
    folderController.restoreFolder.bind(folderController)
  );

  router.delete(
    "/:folderId",
    jwtAuth,
    folderController.deleteFolderPermanent.bind(folderController)
  );

  router.patch(
    "/:folderId/star",
    jwtAuth,
    folderController.starFolder.bind(folderController)
  );

  router.patch(
    "/:folderId/unstar",
    jwtAuth,
    folderController.unstarFolder.bind(folderController)
  );

  router.get(
    "/:folderId/content",
    jwtAuth,
    folderController.getFolderContent.bind(folderController)
  );

  return router;
}
