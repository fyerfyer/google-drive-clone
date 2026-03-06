<div align="center">
  <img src="frontend/public/mind-drive.svg" width="120" alt="MindDrive Logo" />
  <h1>MindDrive</h1>
  <p>与你共同思考的 AI 原生云盘 —— 不只是存储，更是理解。</p>
</div>

中文 | [English](./README.md)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## 📖 项目简介

**MindDrive** 是一个自托管的 AI 原生文件管理系统，远不止于文件存储。其核心是内置的 **AI Assistance（智能助手）** 系统，采用 **MultiAgent 架构**，允许用户通过自然语言与云盘交互——分享文件、编辑文档、语义检索、内容总结，全部由协同工作的智能 Agent 驱动执行。

## ✨ 核心特性

- **文件全生命周期管理**：上传、下载、整理、重命名，一站搞定。
- **文件分享**：细粒度权限控制，可将文件或目录分享给指定用户。
- **内置 AI 助手**：通过对话驱动 Agent，代你完成文件的分享、编辑、检索与总结。
- **语义检索**：基于 Qdrant 向量数据库，支持自然语言文档搜索。
- **协作文档编辑**：集成 OnlyOffice，支持实时在线文档编辑。
- **弹性对象存储**：基于 MinIO 的 S3 兼容存储，轻松横向扩展。
- **MCP 集成**：通过 Model Context Protocol 将云盘内容暴露给外部 AI 客户端（Cursor、Claude Desktop 等）。

## 🤖 AI Assistance 与 MultiAgent 架构

MindDrive 的核心亮点是其内置的 **Assistance（智能助手）** 系统——一个对话式界面，能将用户意图拆解并分发给多个专职 AI Agent 协同完成。

### Agent 角色说明

| Agent              | 职责                                                                         |
| ------------------ | ---------------------------------------------------------------------------- |
| **TaskPlan Agent** | 总调度。解析用户意图，将其拆解为结构化任务计划，并将子任务分发给对应 Agent。 |
| **DocumentAgent**  | 负责文档级操作：读取内容、编辑文件、生成摘要。                               |
| **DriveAgent**     | 负责云盘级操作：文件/目录的分享、移动、重命名及权限管理。                    |
| **SearchAgent**    | 基于向量知识库执行语义检索与关键词搜索。                                     |

### 工作流程

当用户发送自然语言请求时（例如：_"总结 Q3 报告并分享给 Alice"_），执行流程如下：

```
用户输入
    │
    ▼
[TaskPlan Agent]  ──── 解析意图，拆解为子任务
    │
    ├──► [DocumentAgent]   →  读取并总结 Q3 报告
    └──► [DriveAgent]      →  将文件分享给 Alice
```

子任务通过基于 **Redis** 的 **BullMQ** 消息队列异步分发，确保复杂多步操作的可靠有序执行；**Redis Pub/Sub** 则负责将 Agent 的执行进度和结果实时推送回客户端。

## 🏗️ 架构 & 技术栈

MindDrive 构建于现代、可扩展的技术栈之上，专为 AI 原生架构而设计：

| 层级           | 技术                                                           |
| -------------- | -------------------------------------------------------------- |
| **前端**       | React + Vite                                                   |
| **后端**       | Node.js / Express                                              |
| **数据库**     | MongoDB（含副本集，支持事务）                                  |
| **对象存储**   | MinIO（S3 兼容）                                               |
| **缓存**       | Redis                                                          |
| **消息队列**   | BullMQ（基于 Redis）—— 驱动 Agent 异步任务分发                 |
| **实时消息**   | Redis Pub/Sub —— 将 Agent 执行结果实时推送至客户端             |
| **向量数据库** | Qdrant（语义检索 & 知识层）                                    |
| **文档服务器** | OnlyOffice                                                     |
| **AI 协议**    | Model Context Protocol (MCP) —— 将云盘内容暴露给外部 AI 客户端 |

## 🚀 快速启动

使用 Docker 是运行 MindDrive 最简单的方式。请确保已安装 Docker 和 Docker Compose。

```bash
# 克隆仓库
git clone https://github.com/your-username/MindDrive.git
cd MindDrive

# 在后台启动所有服务
docker compose up -d
```

所有容器健康运行后，访问 `http://localhost:3000` 即可使用。

## 🛠️ 本地开发启动

如果你希望不借助 Docker 在本地运行项目（例如用于开发调试）：

### 1. 启动基础设施依赖

通过 Docker Compose 启动基础服务（MongoDB、MinIO、Redis、Qdrant、OnlyOffice）：

```bash
docker compose up mongo minio redis qdrant onlyoffice -d
```

### 2. 启动后端

```bash
cd backend
npm install
npm run dev
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

## 🔌 MCP 集成（外部 AI 客户端）

MindDrive 实现了 **Model Context Protocol (MCP)**，允许外部 AI 助手（Cursor、Claude Desktop 等）直接读取并操作你的云盘内容。

### 连接 MCP 客户端（以 Cursor / VSCode 为例）

在客户端 MCP 配置文件中添加如下内容（如 `.vscode/mcp.json`）：

```json
{
  "mcpServers": {
    "mdrive-stdio": {
      "command": "npm",
      "args": ["run", "mcp:stdio"],
      "cwd": "YOUR_PATH_TO_MDRIVE/backend",
      "env": {
        "NODE_ENV": "mcp",
        "MCP_API_KEY": "YOUR MCP API KEY"
      },
      "type": "stdio"
    }
  }
}
```

> **注意**：请将 `cwd` 替换为你本地 `backend` 目录的实际绝对路径，并提供有效的 `MCP_API_KEY`。

### 手动启动

```bash
cd backend
NODE_ENV=mcp MCP_API_KEY="YOUR MCP API KEY" npm run mcp:stdio
```

## 📄 许可证

本项目遵循 Apache 2.0 许可证。
