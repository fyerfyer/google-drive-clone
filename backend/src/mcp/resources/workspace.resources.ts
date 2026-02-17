import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServices } from "../server";
import { config } from "../../config/env";

export function registerWorkspaceResources(
  server: McpServer,
  _services: McpServices,
): void {
  // ─── drive://config ───
  // 提供驱动器的能力配置信息
  server.registerResource(
    "drive-config",
    "drive://config",
    {
      title: "Drive Configuration",
      description:
        "Google Drive Clone configuration and capability information",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              name: "Google Drive Clone",
              version: "1.0.0",
              capabilities: {
                atomic: [
                  "list_files",
                  "read_file",
                  "write_file",
                  "create_file",
                  "get_file_info",
                  "rename_file",
                  "move_file",
                  "trash_file",
                  "restore_file",
                  "delete_file",
                  "star_file",
                  "get_download_url",
                  "list_folder_contents",
                  "create_folder",
                  "rename_folder",
                  "move_folder",
                  "trash_folder",
                  "restore_folder",
                  "delete_folder",
                  "get_folder_path",
                  "star_folder",
                  "create_share_link",
                  "list_share_links",
                  "revoke_share_link",
                  "share_with_users",
                  "get_permissions",
                  "list_shared_with_me",
                ],
                semantic: [
                  "search_files",
                  "summarize_directory",
                  "query_workspace_knowledge",
                ],
                workflow: [
                  // TODO：设计一些典型的工作流工具
                  // "create_report_from_folder",
                  // "notify_collaborators",
                  // "generate_release_notes",
                ],
              },
              storage: {
                type: "MinIO (S3-compatible)",
                database: "MongoDB",
                cache: "Redis",
              },
              features: {
                onlyoffice: true,
                realTimeCollaboration: false,
                vectorSearch: false,
                embedding: false,
              },
              limits: {
                trashRetentionDays: config.trashRetentionDays,
              },
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  // ─── drive://status ───
  // 提供驱动器运行时状态
  server.registerResource(
    "drive-status",
    "drive://status",
    {
      title: "Drive Status",
      description: "Current runtime status of the Drive service",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              status: "running",
              environment: config.nodeEnv,
              timestamp: new Date().toISOString(),
              uptime: process.uptime(),
              memory: {
                heapUsed: Math.round(
                  process.memoryUsage().heapUsed / 1024 / 1024,
                ),
                heapTotal: Math.round(
                  process.memoryUsage().heapTotal / 1024 / 1024,
                ),
                unit: "MB",
              },
            },
            null,
            2,
          ),
        },
      ],
    }),
  );
}
