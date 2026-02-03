/**
 * Share Routes - 共享相关路由
 *
 * 路由设计：
 * - 公开路由（无需认证）：通过分享链接访问资源
 * - 认证路由：管理分享、创建链接等
 */

import { Router } from "express";
import { ShareController } from "../controllers/share.controller";
import { jwtAuth } from "../middlewares/auth.middleware";

export function createShareRouter(shareController: ShareController) {
  const router = Router();

  // ==================== Public Routes ====================
  // 通过分享链接访问资源（无需认证）

  // 获取分享资源的元信息
  router.get(
    "/public/:resourceType/:token",
    shareController.getSharedByToken.bind(shareController),
  );

  // 文件下载
  router.get(
    "/public/file/:token/download",
    shareController.downloadSharedFile.bind(shareController),
  );

  // 文件预览（流式）
  router.get(
    "/public/file/:token/preview",
    shareController.previewSharedFile.bind(shareController),
  );

  // 获取文件预览 URL
  router.get(
    "/public/file/:token/preview-url",
    shareController.getSharedFilePreviewUrl.bind(shareController),
  );

  // 获取分享文件夹内容
  router.get(
    "/public/folder/:token/content",
    shareController.getSharedFolderContent.bind(shareController),
  );

  // 获取分享文件夹路径（面包屑）
  router.get(
    "/public/folder/:token/path/:folderId",
    shareController.getSharedFolderPath.bind(shareController),
  );

  // 保存分享资源到用户 Drive（需要登录）
  router.post(
    "/public/:resourceType/:token/save",
    jwtAuth,
    shareController.saveSharedResource.bind(shareController),
  );

  // ==================== Authenticated Routes ====================
  // 以下路由需要认证
  router.use(jwtAuth);

  // --- ACL 管理 ---

  // 分享资源给用户
  router.post("/resource", shareController.shareResource.bind(shareController));

  // 列出与我共享的资源
  router.get(
    "/shared-with-me",
    shareController.listSharedWithMe.bind(shareController),
  );

  // 获取资源的权限信息
  router.get(
    "/:resourceId/permissions",
    shareController.getResourcePermissions.bind(shareController),
  );

  // 移除用户权限
  router.delete(
    "/:resourceId/permissions/:targetUserId",
    shareController.removePermission.bind(shareController),
  );

  // 修改用户权限
  router.patch(
    "/:resourceId/permissions/:targetUserId",
    shareController.changePermission.bind(shareController),
  );

  // --- ShareLink 管理 ---

  // 创建分享链接
  router.post(
    "/:resourceId/links",
    shareController.createShareLink.bind(shareController),
  );

  // 列出资源的所有分享链接
  router.get(
    "/:resourceId/links",
    shareController.listShareLinks.bind(shareController),
  );

  // 更新分享链接
  router.patch(
    "/links/:linkId",
    shareController.updateShareLink.bind(shareController),
  );

  // 撤销分享链接
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
