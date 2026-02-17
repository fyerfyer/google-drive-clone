import { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../lib/logger";

export function createMcpRouter(createMcpServer: () => McpServer): Router {
  const router = Router();

  // 活跃会话的 transport 映射
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // POST /api/mcp
  router.post("/", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // 已有会话，复用 transport
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      try {
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        logger.error(
          { error, sessionId },
          "Error handling MCP request for existing session",
        );
        if (!res.headersSent) {
          res.status(500).json({ error: "Internal server error" });
        }
      }
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport);
          logger.info({ sessionId: sid }, "MCP session initialized");
        },
      });

      // transport 关闭时清理
      transport.onclose = () => {
        const sid = Array.from(transports.entries()).find(
          ([, t]) => t === transport,
        )?.[0];
        if (sid) {
          transports.delete(sid);
          logger.info({ sessionId: sid }, "MCP session closed");
        }
      };

      const server = createMcpServer();
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        logger.error({ error }, "Error initializing MCP session");
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to initialize MCP session" });
        }
      }
      return;
    }

    // 无效请求
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32600,
        message: "Invalid request: no valid session ID or initialize request",
      },
      id: null,
    });
  });

  // GET /api/mcp
  // SSE 通知流
  router.get("/", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }

    const transport = transports.get(sessionId)!;
    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      logger.error({ error, sessionId }, "Error handling MCP GET request");
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // DELETE /api/mcp
  // 终止会话
  router.delete("/", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }

    const transport = transports.get(sessionId)!;
    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      logger.error({ error, sessionId }, "Error handling MCP DELETE request");
    }
    transports.delete(sessionId);
    logger.info({ sessionId }, "MCP session terminated via DELETE");
  });

  return router;
}
