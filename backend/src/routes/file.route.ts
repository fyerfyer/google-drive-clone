import { Router } from "express";
import { jwtAuth } from "../middlewares/auth.middleware";
import { fileUpload } from "../middlewares/upload";
import { FileController } from "../controllers/file.controller";

export function createFileRouter(fileController: FileController) {
  const router = Router();

  router.post(
    "/upload",
    jwtAuth,
    fileUpload.single("file"),
    fileController.uploadFile.bind(fileController)
  );

  router.get(
    "/:fileId/download",
    jwtAuth,
    fileController.downloadFile.bind(fileController)
  );

  router.get(
    "/:fileId/preview",
    jwtAuth,
    fileController.previewFile.bind(fileController)
  );

  router.patch(
    "/:fileId/rename",
    jwtAuth,
    fileController.renameFile.bind(fileController)
  );

  router.patch(
    "/:fileId/move",
    jwtAuth,
    fileController.moveFile.bind(fileController)
  );

  router.patch(
    "/:fileId/star",
    jwtAuth,
    fileController.starFile.bind(fileController)
  );

  router.patch(
    "/:fileId/unstar",
    jwtAuth,
    fileController.unstarFile.bind(fileController)
  );

  router.post(
    "/:fileId/trash",
    jwtAuth,
    fileController.trashFile.bind(fileController)
  );

  router.post(
    "/:fileId/restore",
    jwtAuth,
    fileController.restoreFile.bind(fileController)
  );

  router.delete(
    "/:fileId",
    jwtAuth,
    fileController.deleteFilePermanent.bind(fileController)
  );

  return router;
}
