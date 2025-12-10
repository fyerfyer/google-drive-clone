import { Router } from "express";
import { jwtAuth } from "../middlewares/auth.middleware";
import { FileController } from "../controllers/file.controller";

export function createFileRouter(fileController: FileController) {
  const router = Router();
  router.use(jwtAuth);

  // Create file record after successful upload
  router.post("/", fileController.createFile.bind(fileController));

  router.get(
    "/:fileId/download",
    fileController.downloadFile.bind(fileController)
  );

  router.get(
    "/:fileId/preview",
    fileController.previewFile.bind(fileController)
  );

  router.patch(
    "/:fileId/rename",
    fileController.renameFile.bind(fileController)
  );

  router.patch("/:fileId/move", fileController.moveFile.bind(fileController));

  router.patch("/:fileId/star", fileController.starFile.bind(fileController));

  router.patch(
    "/:fileId/unstar",
    fileController.unstarFile.bind(fileController)
  );

  router.post("/:fileId/trash", fileController.trashFile.bind(fileController));

  router.post(
    "/:fileId/restore",
    fileController.restoreFile.bind(fileController)
  );

  router.delete(
    "/:fileId",
    fileController.deleteFilePermanent.bind(fileController)
  );

  return router;
}
