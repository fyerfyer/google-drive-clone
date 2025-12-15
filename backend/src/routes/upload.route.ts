import { Router } from "express";
import { UploadController } from "../controllers/upload.controller";
import { jwtAuth } from "../middlewares/auth.middleware";

export function createUploadRouter(uploadController: UploadController) {
  const router = Router();
  router.use(jwtAuth);

  router.post(
    "/presign-avatar",
    uploadController.presignAvatar.bind(uploadController)
  );

  router.post(
    "/presign-file",
    uploadController.presignFile.bind(uploadController)
  );

  router.post(
    "/multipart",
    uploadController.createMultipartUpload.bind(uploadController)
  );

  router.get(
    "/multipart/:uploadId/:partNumber",
    uploadController.signPart.bind(uploadController)
  );

  router.get(
    "/multipart/:uploadId/parts",
    uploadController.listParts.bind(uploadController)
  );

  router.post(
    "/multipart/:uploadId/complete",
    uploadController.completeMultipartUpload.bind(uploadController)
  );

  router.delete(
    "/multipart/:uploadId",
    uploadController.abortMultipartUpload.bind(uploadController)
  );

  return router;
}
