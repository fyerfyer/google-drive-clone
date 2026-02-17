import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpServices } from "../server";
import { logger } from "../../lib/logger";

export function registerShareTools(
  server: McpServer,
  services: McpServices,
): void {
  const { shareService } = services;

  server.registerTool(
    "create_share_link",
    {
      description:
        "Create a shareable link for a file or folder. Anyone with the link can access the resource according to the specified role.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID (resource owner or admin)"),
        resourceId: z.string().describe("The file or folder ID to share"),
        resourceType: z
          .enum(["File", "Folder"])
          .describe("Whether the resource is a File or Folder"),
        role: z
          .enum(["viewer", "editor"])
          .optional()
          .describe(
            "The permission role for link recipients. Defaults to 'viewer'.",
          ),
        password: z
          .string()
          .optional()
          .describe("Optional password protection for the link"),
        expiresAt: z
          .string()
          .optional()
          .describe(
            "Optional expiration date in ISO 8601 format (e.g., '2026-12-31T23:59:59Z')",
          ),
      }),
    },
    async ({ userId, resourceId, resourceType, role, password, expiresAt }) => {
      try {
        const link = await shareService.createShareLink({
          actorId: userId,
          resourceId,
          resourceType: resourceType as any,
          role: role || "viewer",
          password,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        } as any);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  shareLink: {
                    id: link._id || (link as any).id,
                    token: link.token,
                    role: link.policy?.role,
                    expiresAt: link.policy?.expiresAt,
                    url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/share/${link.token}`,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { error: message, userId, resourceId },
          "MCP create_share_link failed",
        );
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "list_share_links",
    {
      description: "List all share links for a specific resource.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        resourceId: z.string().describe("The file or folder ID"),
        resourceType: z
          .enum(["File", "Folder"])
          .describe("Whether the resource is a File or Folder"),
      }),
    },
    async ({ userId, resourceId, resourceType }) => {
      try {
        const links = await shareService.listShareLinks(
          userId,
          resourceId,
          resourceType as any,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  count: links.length,
                  links,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "revoke_share_link",
    {
      description: "Revoke (disable) an existing share link.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        linkId: z.string().describe("The share link ID to revoke"),
      }),
    },
    async ({ userId, linkId }) => {
      try {
        await shareService.revokeShareLink({
          actorId: userId,
          linkId,
        } as any);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                linkId,
                action: "revoked",
              }),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "share_with_users",
    {
      description:
        "Share a resource directly with specific users by their email addresses.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID (resource owner)"),
        resourceId: z.string().describe("The file or folder ID to share"),
        resourceType: z
          .enum(["File", "Folder"])
          .describe("Whether the resource is a File or Folder"),
        emails: z
          .array(z.string().email())
          .describe("Array of email addresses to share with"),
        role: z
          .enum(["viewer", "editor"])
          .describe("The permission role to give to the users"),
      }),
    },
    async ({ userId, resourceId, resourceType, emails, role }) => {
      try {
        const result = await shareService.shareWithUsers({
          actorId: userId,
          resourceId,
          resourceType: resourceType as any,
          emails,
          role,
        } as any);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  result,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_permissions",
    {
      description:
        "Get the permission information for a resource, including who has access and their roles.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        resourceId: z.string().describe("The file or folder ID"),
        resourceType: z
          .enum(["File", "Folder"])
          .describe("Whether the resource is a File or Folder"),
      }),
    },
    async ({ userId, resourceId, resourceType }) => {
      try {
        const permissions = await shareService.getResourcePermissions(
          userId,
          resourceId,
          resourceType as any,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(permissions, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "list_shared_with_me",
    {
      description: "List resources that have been shared with the user.",
      inputSchema: z.object({
        userId: z.string().describe("The user ID"),
        resourceType: z
          .enum(["File", "Folder", "all"])
          .optional()
          .describe("Filter by resource type. Defaults to 'all'."),
      }),
    },
    async ({ userId, resourceType }) => {
      try {
        const result = await shareService.listSharedWithMe({
          userId,
          // TODO：undefined 会有 Bug 吗？
          type: resourceType === "all" ? undefined : (resourceType as any),
        } as any);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
