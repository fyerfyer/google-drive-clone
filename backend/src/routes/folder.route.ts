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

  router.post(
    "/move",
    jwtAuth,
    folderController.moveFolder.bind(folderController)
  );

  router.post(
    "/trash",
    jwtAuth,
    folderController.trashFolder.bind(folderController)
  );

  router.get(
    "/content/:folderId",
    jwtAuth,
    folderController.getFolderContent.bind(folderController)
  );

  return router;
}
