import mongoose, { Schema, Document } from "mongoose";

// 存储文件分块的文本内容和元信息
// MongoDB 只负责存储文本内容、元数据和关键词搜索。

export interface IFileChunkMetadata {
  fileName: string;
  mimeType: string;
  fileSize: number;
  chunkOffset: number;
  totalChunks: number;
}

export interface IFileChunk extends Document {
  file: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  chunkIndex: number;
  content: string;
  metadata: IFileChunkMetadata;
  isIndexed: boolean; // embedding 是否已写入 Qdrant
  createdAt: Date;
  updatedAt: Date;
}

const fileChunkMetadataSchema = new Schema<IFileChunkMetadata>(
  {
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    chunkOffset: { type: Number, required: true, default: 0 },
    totalChunks: { type: Number, required: true, default: 1 },
  },
  { _id: false },
);

const fileChunkSchema = new Schema<IFileChunk>(
  {
    file: {
      type: Schema.Types.ObjectId,
      ref: "File",
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    chunkIndex: { type: Number, required: true, default: 0 },
    content: { type: String, required: true },
    metadata: { type: fileChunkMetadataSchema, required: true },
    isIndexed: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete (ret as Record<string, unknown>)._id;
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  },
);

// 文件+顺序查询
fileChunkSchema.index({ file: 1, chunkIndex: 1 });

// 用户维度查询
fileChunkSchema.index({ user: 1, isIndexed: 1 });

// 关键词搜索（content全文索引）
fileChunkSchema.index({ content: "text" });

const FileChunk = mongoose.model<IFileChunk>("FileChunk", fileChunkSchema);
export default FileChunk;
