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
    "/download/:fileId",
    jwtAuth,
    fileController.downloadFile.bind(fileController)
  );

  return router;
}
