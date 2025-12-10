# 测试更新说明

## ⚠️ 重要提示

由于文件上传架构从 Multer Buffer 改为 Presigned URL 直传，以下测试文件需要更新以适配新架构:

### 需要更新的测试文件

1. **`src/__test__/integration/folder-file.test.ts`** (7 处)
2. **`src/__test__/unit/file.service.test.ts`** (6 处)
3. **`src/__test__/unit/folder.service.test.ts`** (5 处)

### 问题描述

旧测试调用了已废弃的 `fileService.uploadFile()` 方法:

```typescript
// ❌ 旧代码 - 已废弃
const file = await fileService.uploadFile({
  userId,
  folderId,
  fileBuffer: Buffer.from("test"),
  fileSize: 1024,
  mimeType: "text/plain",
  originalName: "test.txt",
});
```

### 解决方案

新架构下,文件上传分为两步:

1. **前端直传到 MinIO** (使用 Presigned URL)
2. **后端创建文件记录** (调用 `createFileRecord`)

#### 更新测试代码示例

```typescript
// ✅ 新代码 - 适配新架构
import { StorageService } from "../services/storage.service";
import { BUCKETS } from "../config/s3";

// Step 1: 模拟前端上传到 MinIO
const key = `${userId}/file/${uuidv4()}/test.txt`;
const fileBuffer = Buffer.from("test file content");

await StorageService.putObject(
  BUCKETS.FILES,
  key,
  fileBuffer,
  fileBuffer.length,
  "text/plain"
);

// Step 2: 创建文件记录
const file = await fileService.createFileRecord({
  userId,
  folderId,
  key,
  fileSize: fileBuffer.length,
  mimeType: "text/plain",
  originalName: "test.txt",
  hash: undefined, // 可选: 用于秒传
});
```

### 批量更新指南

#### 1. 添加导入

在测试文件顶部添加:

```typescript
import { v4 as uuidv4 } from "uuid";
import { StorageService } from "../../services/storage.service";
import { BUCKETS } from "../../config/s3";
```

#### 2. 创建辅助函数

在 `beforeAll` 或测试文件顶部添加:

```typescript
async function uploadTestFile(
  userId: string,
  folderId: string,
  fileName: string = "test.txt",
  content: string = "test content"
) {
  const key = `${userId}/file/${uuidv4()}/${fileName}`;
  const buffer = Buffer.from(content);

  // Upload to MinIO
  await StorageService.putObject(
    BUCKETS.FILES,
    key,
    buffer,
    buffer.length,
    "text/plain"
  );

  // Create file record
  return await fileService.createFileRecord({
    userId,
    folderId,
    key,
    fileSize: buffer.length,
    mimeType: "text/plain",
    originalName: fileName,
  });
}
```

#### 3. 替换所有 uploadFile 调用

```typescript
// 替换前
const file = await fileService.uploadFile({
  userId: user.id,
  folderId: folder.id,
  fileBuffer: Buffer.from("test"),
  fileSize: 1024,
  mimeType: "text/plain",
  originalName: "test.txt",
});

// 替换后
const file = await uploadTestFile(
  user.id,
  folder.id,
  "test.txt",
  "test content"
);
```

### 清理建议

在更新完测试后,可以在 `afterEach` 或 `afterAll` 中清理 MinIO 对象:

```typescript
afterAll(async () => {
  // Clean up MinIO objects
  const testKeys = [...]; // 收集所有测试用的 keys
  for (const key of testKeys) {
    await StorageService.deleteObject(BUCKETS.FILES, key).catch(() => {
      // Ignore errors
    });
  }
});
```

---

## 测试优先级

### P0 (必须修复)

- [ ] `folder-file.test.ts` - 集成测试,涉及文件夹和文件的核心功能
- [ ] `file.service.test.ts` - 文件服务单元测试

### P1 (建议修复)

- [ ] `folder.service.test.ts` - 文件夹服务单元测试

---

## 临时解决方案

如果暂时不想更新测试,可以在 FileService 中添加一个废弃的 `uploadFile` 方法作为适配器:

```typescript
// 在 FileService 中添加
/**
 * @deprecated 仅用于兼容旧测试,不应在生产代码中使用
 * 请使用 createFileRecord 代替
 */
async uploadFile(data: {
  userId: string;
  folderId: string;
  fileBuffer: Buffer;
  fileSize: number;
  mimeType: string;
  originalName: string;
  hash?: string;
}) {
  // 模拟上传到 MinIO
  const key = `${data.userId}/file/${uuidv4()}/${data.originalName}`;

  await StorageService.putObject(
    BUCKETS.FILES,
    key,
    data.fileBuffer,
    data.fileSize,
    data.mimeType
  );

  // 创建记录
  return await this.createFileRecord({
    userId: data.userId,
    folderId: data.folderId,
    key,
    fileSize: data.fileSize,
    mimeType: data.mimeType,
    originalName: data.originalName,
    hash: data.hash,
  });
}
```

⚠️ **注意**: 这只是临时方案,不推荐在生产代码中使用。

---

**最后更新**: 2024-12-08
