import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpServer, McpServices } from "../mcp/server";
import { logger } from "../lib/logger";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export class McpClientService {
  private client: Client | null = null;
  private server: McpServer | null = null;
  private cachedTools: McpToolDefinition[] | null = null;

  constructor(private services: McpServices) {}

  // 连接 in-memory MCP Server
  async connect(): Promise<void> {
    if (this.client) return;

    this.server = createMcpServer(this.services);
    this.client = new Client({
      name: "gdrive-internal-agent",
      version: "1.0.0",
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      this.client.connect(clientTransport),
      this.server.connect(serverTransport),
    ]);

    logger.info("MCP Client connected to in-process server");
  }

  async listTools(): Promise<McpToolDefinition[]> {
    if (this.cachedTools) return this.cachedTools;

    await this.connect();
    const result = await this.client!.listTools();

    this.cachedTools = result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));

    logger.info({ count: this.cachedTools.length }, "MCP tools loaded");
    return this.cachedTools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    await this.connect();

    logger.info({ tool: name, args }, "Calling MCP tool");

    const result = await this.client!.callTool({ name, arguments: args });

    const content =
      (result.content as Array<{ type: string; text: string }>) || [];
    const isError = result.isError as boolean | undefined;

    logger.info(
      { tool: name, isError, resultLength: content.length },
      "MCP tool result",
    );

    return { content, isError };
  }

  invalidateCache(): void {
    this.cachedTools = null;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.server = null;
      this.cachedTools = null;
    }
  }
}
