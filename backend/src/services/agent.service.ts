import Conversation, {
  IConversation,
  IMessage,
  IToolCall,
} from "../models/Conversation.model";
import { McpClientService, McpToolDefinition } from "./mcp-client.service";
import { logger } from "../lib/logger";
import { AppError } from "../middlewares/errorHandler";
import { StatusCodes } from "http-status-codes";
import { config } from "../config/env";

interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

interface LlmToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface LlmTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface LlmChoice {
  message: LlmMessage;
  finish_reason: string;
}

interface LlmResponse {
  choices: LlmChoice[];
}

export interface AgentChatResponse {
  conversationId: string;
  message: IMessage;
}

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  updatedAt: Date;
}

const SYSTEM_PROMPT = `You are an AI assistant for Google Drive Clone — a cloud storage platform. You help users manage their files, folders, and sharing through natural language.

## Your Capabilities
You have access to tools that can:
- **File Operations**: List, read, write, create, rename, move, trash, restore, delete, star files, and get download URLs
- **Folder Operations**: List contents, create, rename, move, trash, restore, delete, star folders, and get folder paths  
- **Search**: Search files by name/extension, summarize directory statistics, and query workspace knowledge
- **Sharing**: Create share links, list share links, revoke share links, share with users, get permissions, list items shared with the user

## Important Rules
1. ALWAYS use the user's ID (provided in the system context) as the \`userId\` parameter when calling tools.
2. When the user asks to perform actions, use the appropriate tools. Don't just describe what you would do.
3. For multi-step operations (like "move all PDF files to folder X"), break them down into individual tool calls.
4. Present results clearly and concisely. Summarize lists instead of dumping raw JSON.
5. If a tool call fails, explain the error in a user-friendly way and suggest alternatives.
6. When listing files or folders, format them in a readable way (use names, sizes, dates).
7. For file sizes, convert bytes to human-readable format (KB, MB, GB).
8. Respond in the same language the user uses.

## Context
- This is a full-featured cloud drive with MinIO (S3-compatible) storage, MongoDB, and Redis
- Files support OnlyOffice editing for documents, spreadsheets, and presentations
- The system supports permission-based sharing with viewer/editor/commenter roles`;

const MAX_TOOL_CALLS_PER_TURN = 10;

export class AgentService {
  constructor(private mcpClient: McpClientService) {}

  async chat(
    userId: string,
    message: string,
    conversationId?: string,
  ): Promise<AgentChatResponse> {
    let conversation: IConversation;
    if (conversationId) {
      conversation = await this.getConversationOrThrow(conversationId, userId);
    } else {
      conversation = new Conversation({
        userId,
        messages: [],
      });
    }

    const userMessage: IMessage = {
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    conversation.messages.push(userMessage);

    const tools = await this.mcpClient.listTools();
    const llmTools = this.buildLlmTools(tools);
    const llmMessages = this.buildLlmMessages(conversation.messages, userId);

    // 运行 Agent Loop (tool calls → LLM → tool calls → ...)
    const { content, toolCalls } = await this.runAgentLoop(
      llmMessages,
      llmTools,
      userId,
    );

    const assistantMessage: IMessage = {
      role: "assistant",
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      timestamp: new Date(),
    };
    conversation.messages.push(assistantMessage);

    await conversation.save();

    return {
      conversationId: conversation._id.toString(),
      message: assistantMessage,
    };
  }

  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const conversations = await Conversation.find({ userId, isActive: true })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    return conversations.map((c) => {
      const lastMsg = c.messages[c.messages.length - 1];
      return {
        id: c._id.toString(),
        title: c.title,
        lastMessage: lastMsg ? lastMsg.content.slice(0, 100) : "",
        messageCount: c.messages.length,
        updatedAt: c.updatedAt,
      };
    });
  }

  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<IConversation> {
    return this.getConversationOrThrow(conversationId, userId);
  }

  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.getConversationOrThrow(
      conversationId,
      userId,
    );
    conversation.isActive = false;
    await conversation.save();
  }

  private async getConversationOrThrow(
    conversationId: string,
    userId: string,
  ): Promise<IConversation> {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId,
      isActive: true,
    });
    if (!conversation) {
      throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
    }
    return conversation;
  }

  private async runAgentLoop(
    messages: LlmMessage[],
    tools: LlmTool[],
    userId: string,
  ): Promise<{ content: string; toolCalls: IToolCall[] }> {
    const allToolCalls: IToolCall[] = [];
    let iteration = 0;

    while (iteration < MAX_TOOL_CALLS_PER_TURN) {
      iteration++;

      const response = await this.callLlm(messages, tools);
      const choice = response.choices[0];

      if (!choice) {
        return {
          content:
            "I apologize, but I received an empty response. Please try again.",
          toolCalls: allToolCalls,
        };
      }

      const assistantMsg = choice.message;

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        return {
          content: assistantMsg.content || "Done.",
          toolCalls: allToolCalls,
        };
      }

      messages.push(assistantMsg);

      // 执行工具调用
      for (const toolCall of assistantMsg.tool_calls) {
        const { name, arguments: argsStr } = toolCall.function;

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(argsStr);
        } catch {
          args = {};
        }

        args.userId = userId;

        let result: string;
        let isError = false;

        try {
          const toolResult = await this.mcpClient.callTool(name, args);
          result = toolResult.content.map((c) => c.text).join("\n");
          isError = toolResult.isError || false;
        } catch (error) {
          result = `Tool execution error: ${error instanceof Error ? error.message : "Unknown error"}`;
          isError = true;
          logger.error({ error, tool: name, args }, "Agent tool call failed");
        }

        allToolCalls.push({
          toolName: name,
          args,
          result,
          isError,
        });

        messages.push({
          role: "tool",
          content: result,
          tool_call_id: toolCall.id,
        });
      }
    }

    return {
      content:
        "I've reached the maximum number of operations in a single turn. Please continue with additional instructions.",
      toolCalls: allToolCalls,
    };
  }

  // 将 MCP 工具定义转换为 LLM 可识别的工具格式
  private buildLlmTools(tools: McpToolDefinition[]): LlmTool[] {
    return tools.map((tool) => {
      // 我们之后会手动注入 userId
      const schema = { ...tool.inputSchema };
      if (schema.properties && typeof schema.properties === "object") {
        const props = { ...(schema.properties as Record<string, unknown>) };
        delete props.userId;
        schema.properties = props;
      }
      if (Array.isArray(schema.required)) {
        schema.required = (schema.required as string[]).filter(
          (r) => r !== "userId",
        );
      }

      return {
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: schema,
        },
      };
    });
  }

  private buildLlmMessages(messages: IMessage[], userId: string): LlmMessage[] {
    const llmMessages: LlmMessage[] = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\n## Current User Context\n- User ID: ${userId}\n- Timestamp: ${new Date().toISOString()}`,
      },
    ];

    for (const msg of messages) {
      if (msg.role === "user") {
        llmMessages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        llmMessages.push({ role: "assistant", content: msg.content });
      }
    }

    return llmMessages;
  }

  private async callLlm(
    messages: LlmMessage[],
    tools: LlmTool[],
  ): Promise<LlmResponse> {
    const apiKey = config.llmApiKey;
    const baseUrl = config.llmBaseUrl;
    const model = config.llmModel;

    if (!apiKey) {
      throw new AppError(
        StatusCodes.SERVICE_UNAVAILABLE,
        "AI Agent is not configured. Please set LLM_API_KEY environment variable.",
      );
    }

    const body = {
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      temperature: 0.3,
      max_tokens: 4096,
    };

    logger.debug(
      { model, messageCount: messages.length, toolCount: tools.length },
      "Calling LLM",
    );

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { status: response.status, error: errorText },
        "LLM API error",
      );
      throw new AppError(
        StatusCodes.BAD_GATEWAY,
        `AI service returned error: ${response.status}`,
      );
    }

    const data = (await response.json()) as LlmResponse;
    return data;
  }
}
