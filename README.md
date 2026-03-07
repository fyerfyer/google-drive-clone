<div align="center">
  <img src="frontend/public/mind-drive.svg" width="120" alt="MindDrive Logo" />
  <h1>MindDrive</h1>
  <p>An AI-native drive that thinks with you — not just stores for you.</p>
</div>

English | [中文](./README.zh-CN.md)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## 📖 Introduction

**MindDrive** is a self-hosted, AI-native file management system that goes far beyond simply storing files. At its core is a built-in **AI Assistance** system powered by a **Multi-Agent architecture**, enabling users to interact with their drive through natural language — sharing files, editing documents, performing semantic searches, and generating summaries, all driven by intelligent agents working in concert.

MindDrive is not a Google Drive clone. It is a rethinking of what a personal drive should look like in the age of AI.

## ✨ Key Features

- **Core File Operations**: Upload, download, organize, rename, and manage files and directories.
- **File Sharing**: Granular permission control — share files or folders with specific users.
- **Built-in AI Assistance**: A conversational agent that can share, edit, search, and summarize your files and directories on your behalf.
- **Automated Embedding Pipeline**: Asynchronous, event-driven background processing for file indexing. Handles automatic creation, updates (on content change), and cleanup (on deletion) of vector embeddings.
- **Semantic Search**: Find any document naturally through Qdrant vector database integration, powered by the automated pipeline.
- **Document Editing**: Real-time document editing powered by OnlyOffice.
- **Scalable Storage**: S3-compatible object storage via MinIO.
- **Deduplication & Sync**: Hash-based verification ensures efficient embedding without redundant computations across identical files.
- **MCP Integration**: Expose your drive context to external AI clients (Cursor, Claude Desktop, etc.) via the Model Context Protocol.

## 🤖 AI Assistance & Multi-Agent Architecture

The heart of MindDrive is its **Assistance** system — a built-in conversational interface that delegates user intents to a coordinated team of specialized AI agents.

### Agent Roles

| Agent              | Responsibility                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **TaskPlan Agent** | The orchestrator. Parses user intent and decomposes it into a structured task plan, dispatching subtasks to the right agents. |
| **DocumentAgent**  | Handles document-level operations: reading content, editing files, and generating summaries.                                  |
| **DriveAgent**     | Handles drive-level operations: sharing files/folders, moving, renaming, and managing permissions.                            |
| **SearchAgent**    | Performs semantic and keyword-based search across the drive using the vector knowledge base.                                  |

### How It Works

When a user sends a natural language request (e.g., _"Summarize the Q3 report and share it with Alice"_), the flow is:

```
User Input
    │
    ▼
[TaskPlan Agent]  ──── Decomposes intent into subtasks
    │
    ├──► [DocumentAgent]   →  Reads & summarizes the Q3 report
    └──► [DriveAgent]      →  Shares the file with Alice
```

Tasks are dispatched asynchronously via **BullMQ** message queues backed by **Redis**, ensuring reliable, ordered execution even for complex multi-step operations. **Redis Pub/Sub** is used to stream agent progress and results back to the client in real time.

### Automated Knowledge Pipeline (Embedding Workflow)

MindDrive features a fully automated, event-driven embedding pipeline that maintains your vector knowledge base in sync with your files.

- **Automatic Indexing**: Triggered immediately upon file creation or update via internal event emitters.
- **State Tracking**: File status is monitored (`pending`, `processing`, `completed`, or `failed`) and visible in the UI.
- **Intelligent Deduplication**: Uses file hashes to avoid redundant embedding of identical content, saving computational resources.
- **Consistent Cleanup**: Cascading delete hooks ensure vector records are purged from Qdrant when files are deleted.
- **Async Execution**: The entire process runs in the background via `EmbeddingWorker`, ensuring zero impact on user interaction responsiveness.

## 🏗️ Architecture & Tech Stack

MindDrive is built on a modern, scalable stack designed to support its AI-first architecture:

| Layer                  | Technology                                                          |
| ---------------------- | ------------------------------------------------------------------- |
| **Frontend**           | React + Vite                                                        |
| **Backend**            | Node.js / Express                                                   |
| **Database**           | MongoDB (with Replica Set for transactions)                         |
| **Object Storage**     | MinIO (S3-compatible)                                               |
| **Cache**              | Redis                                                               |
| **Message Queue**      | BullMQ (backed by Redis) — powers async agent task dispatch         |
| **Realtime Messaging** | Redis Pub/Sub — streams agent execution results to clients          |
| **Vector Database**    | Qdrant (semantic search & knowledge layer)                          |
| **Document Server**    | OnlyOffice                                                          |
| **AI Protocol**        | Model Context Protocol (MCP) — exposes drive to external AI clients |

## 🚀 Quick Start

The easiest way to get MindDrive running is using Docker. Ensure you have Docker and Docker Compose installed.

```bash
# Clone the repository
git clone https://github.com/your-username/MindDrive.git
cd MindDrive

# Start all services in the background
docker compose up -d
```

Once all containers are up and healthy, you can access the application at `http://localhost:3000`.

## 🛠️ Local Development

If you wish to run the project locally without Docker (e.g., for development):

### 1. Start Infrastructure Dependencies

Run the infrastructure services (MongoDB, MinIO, Redis, Qdrant, OnlyOffice) via Docker Compose:

```bash
docker compose up mongo minio redis qdrant onlyoffice -d
```

### 2. Start Backend

```bash
cd backend
npm install
npm run dev
```

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

## 🔌 MCP Integration (External AI Clients)

MindDrive implements the **Model Context Protocol (MCP)**, allowing external AI assistants (Cursor, Claude Desktop, etc.) to read and interact with your drive context directly.

### Connecting an MCP Client (e.g., Cursor / VSCode)

Add the following to your MCP client configuration (e.g., `.vscode/mcp.json`):

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

> **Note**: Replace `cwd` with the absolute path to your cloned `backend` directory and provide a valid `MCP_API_KEY`.

### Manual Start

```bash
cd backend
NODE_ENV=mcp MCP_API_KEY="YOUR MCP API KEY" npm run mcp:stdio
```

## 📄 License

Apache License 2.0.
