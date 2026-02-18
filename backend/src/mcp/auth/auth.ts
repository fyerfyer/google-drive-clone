import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiKeyService } from "../../services/apikey.service";
import { logger } from "../../lib/logger";

// 维护当前 MCP 会话的认证状态。
// 支持两种认证方式：
//   1. API Key：通过 MCP_API_KEY 环境变量或 authenticate Tool
//   2. whoami：查看当前认证状态

export interface McpAuthContext {
  userId?: string;
  userEmail?: string;
  userName?: string;
  authenticatedAt?: Date;
  authMethod?: "api_key" | "none";
  keyName?: string;
}

export function createAuthContext(): McpAuthContext {
  return {};
}

// 从 tool 参数或 auth context 中解析 userId
// 优先使用显式传入的 userId 参数，否则使用认证上下文中的 userId。
// 如果都没有，抛出错误提示用户配置 API Key。
export function resolveUserId(
  providedUserId: string | undefined,
  authContext: McpAuthContext,
): string {
  const userId = providedUserId || authContext.userId;
  if (!userId) {
    throw new Error(
      "Not authenticated. Please set MCP_API_KEY environment variable in your MCP client config, " +
        "or call the 'authenticate' tool with your API key. " +
        "You can generate an API key in the Drive web UI under Settings > API Keys.",
    );
  }
  return userId;
}

// apiService 单例
let _apiKeyService: ApiKeyService | null = null;
function getApiKeyService(): ApiKeyService {
  if (!_apiKeyService) {
    _apiKeyService = new ApiKeyService();
  }
  return _apiKeyService;
}

export async function authenticateWithApiKey(
  rawKey: string,
  authContext: McpAuthContext,
): Promise<boolean> {
  const apiKeyService = getApiKeyService();
  const result = await apiKeyService.validateKey(rawKey);

  if (!result) {
    return false;
  }

  authContext.userId = result.userId;
  authContext.userEmail = result.userEmail;
  authContext.userName = result.userName;
  authContext.authenticatedAt = new Date();
  authContext.authMethod = "api_key";
  authContext.keyName = result.keyName;

  logger.info(
    {
      userId: result.userId,
      email: result.userEmail,
      keyName: result.keyName,
    },
    "MCP session authenticated via API key",
  );

  return true;
}

export function registerAuthTools(
  server: McpServer,
  authContext: McpAuthContext,
): void {
  // authenticate — 通过 API Key 认证
  server.registerTool(
    "authenticate",
    {
      description:
        "Authenticate with the Drive service using an API key. " +
        "You can generate API keys in the Drive web UI under Settings > API Keys. " +
        "After successful authentication, all subsequent tool calls will use your identity. " +
        "Alternatively, set MCP_API_KEY environment variable in your client config for auto-auth.",
      inputSchema: z.object({
        apiKey: z.string().describe("Your API key (starts with 'gdrive_')"),
      }),
    },
    async ({ apiKey }) => {
      try {
        const success = await authenticateWithApiKey(apiKey, authContext);

        if (!success) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error:
                    "Invalid or expired API key. Please generate a new one in the Drive web UI.",
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                message: `Authenticated as ${authContext.userName} (${authContext.userEmail})`,
                userId: authContext.userId,
                name: authContext.userName,
                email: authContext.userEmail,
                keyName: authContext.keyName,
              }),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Authentication failed";
        logger.error({ err: error }, "MCP API key authentication failed");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // whoami — 查看当前认证状态
  server.registerTool(
    "whoami",
    {
      description:
        "Check the current authentication status. Returns the authenticated user's information.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!authContext.userId) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                authenticated: false,
                message:
                  "Not authenticated. Please set MCP_API_KEY in your client config, " +
                  "or call 'authenticate' with your API key. " +
                  "Generate keys at: Drive web UI > Settings > API Keys.",
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              authenticated: true,
              userId: authContext.userId,
              email: authContext.userEmail,
              name: authContext.userName,
              authenticatedAt: authContext.authenticatedAt?.toISOString(),
              authMethod: authContext.authMethod,
              keyName: authContext.keyName,
            }),
          },
        ],
      };
    },
  );
}
