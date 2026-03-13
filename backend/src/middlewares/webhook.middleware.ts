import { Request, Response, NextFunction } from "express";
import { config } from "../config/env";
import { logger } from "../lib/logger";


// 信任 nginx 设置的 X-Real-IP，适用 Docker / proxy 环境
function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const first = Array.isArray(xff) ? xff[0] : xff.split(",")[0];
    return first.trim();
  }
  return req.socket.remoteAddress ?? "";
}

function isInternalIp(ip: string): boolean {
  const addr = ip.replace(/^::ffff:/, "");
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    /^10\./.test(addr) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(addr) ||
    /^192\.168\./.test(addr)
  );
}

export function webhookAuth(req: Request, res: Response, next: NextFunction): void {
  const clientIp = getClientIp(req);

  if (!isInternalIp(clientIp)) {
    logger.warn(
      { ip: clientIp, path: req.path },
      "Webhook rejected: non-internal IP",
    );
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  if (config.webhookSecret) {
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader !== config.webhookSecret) {
      logger.warn(
        { ip: clientIp, path: req.path },
        "Webhook rejected: invalid Authorization token",
      );
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
  } else {
    logger.warn(
      "MINIO_WEBHOOK_SECRET is not set — webhook endpoint is only protected by IP check",
    );
  }

  next();
}
