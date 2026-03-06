import { Router } from "express";
import { UploadController } from "../controllers/upload.controller";
import { jwtAuth } from "../middlewares/auth.middleware";
import {
  uploadLimiter,
  multipartSignLimiter,
} from "../middlewares/rateLimiter";

export function createUploadRouter(uploadController: UploadController) {
  const router = Router();

  router.use(jwtAuth);

  router.post(
    "/presign-avatar",
    uploadLimiter,
    uploadController.presignAvatar.bind(uploadController),
  );

  router.post(
    "/presign-file",
    uploadLimiter,
    uploadController.presignFile.bind(uploadController),
  );

  router.post(
    "/multipart",
    uploadLimiter,
    uploadController.createMultipartUpload.bind(uploadController),
  );

  // 通过一次请求批量签名多个分片（适用于大文件）
  router.post(
    "/multipart/:uploadId/sign-parts",
    multipartSignLimiter,
    uploadController.signParts.bind(uploadController),
  );

  router.get(
    "/multipart/:uploadId/:partNumber",
    multipartSignLimiter,
    uploadController.signPart.bind(uploadController),
  );

  router.get(
    "/multipart/:uploadId/parts",
    multipartSignLimiter,
    uploadController.listParts.bind(uploadController),
  );

  router.post(
    "/multipart/:uploadId/complete",
    uploadLimiter,
    uploadController.completeMultipartUpload.bind(uploadController),
  );

  router.delete(
    "/multipart/:uploadId",
    uploadLimiter,
    uploadController.abortMultipartUpload.bind(uploadController),
  );

  return router;
}
