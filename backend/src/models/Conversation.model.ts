import mongoose, { Document, Schema, Types } from "mongoose";

export interface IToolCall {
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

export interface IMessage {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: IToolCall[];
  timestamp: Date;
}

export interface IConversationContext {
  type?: "drive" | "document";
  folderId?: string;
  fileId?: string;
  fileName?: string;
}

export interface IConversation extends Document {
  userId: Types.ObjectId;
  title: string;
  agentType: "drive" | "document";
  context: IConversationContext;
  messages: IMessage[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const toolCallSchema = new Schema<IToolCall>(
  {
    toolName: { type: String, required: true },
    args: { type: Schema.Types.Mixed, default: {} },
    result: { type: String },
    isError: { type: Boolean, default: false },
  },
  { _id: false },
);

const messageSchema = new Schema<IMessage>(
  {
    role: {
      type: String,
      required: true,
      enum: ["user", "assistant", "system"],
    },
    content: { type: String, required: true },
    toolCalls: { type: [toolCallSchema], default: undefined },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const conversationContextSchema = new Schema(
  {
    type: { type: String, enum: ["drive", "document"] },
    folderId: { type: String },
    fileId: { type: String },
    fileName: { type: String },
  },
  { _id: false },
);

const conversationSchema = new Schema<IConversation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, default: "New Conversation" },
    agentType: {
      type: String,
      enum: ["drive", "document"],
      default: "drive",
    },
    context: { type: conversationContextSchema, default: {} },
    messages: { type: [messageSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

// 根据用户聊天记录自动生成对话标题（仅在创建时，根据第一条用户消息）
conversationSchema.pre("save", function (next) {
  if (this.isNew && this.messages.length > 0) {
    const firstUserMsg = this.messages.find((m) => m.role === "user");
    if (firstUserMsg) {
      this.title =
        firstUserMsg.content.slice(0, 80) +
        (firstUserMsg.content.length > 80 ? "..." : "");
    }
  }
  next();
});

// TTL 索引：isActive 为 false 的对话在 30 天后自动删除
conversationSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 3600,
    partialFilterExpression: { isActive: false },
  },
);

const ConversationModel = mongoose.model<IConversation>(
  "Conversation",
  conversationSchema,
);

export default ConversationModel;
