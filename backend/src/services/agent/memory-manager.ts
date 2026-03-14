/**
 * Memory Manager
 *
 * - 滑动窗口管理 — 保留最近 N 条原始消息
 * - 历史摘要生成 — 对超出窗口的消息生成 LLM 摘要
 * - 上下文组装 — 将摘要 + 滑动窗口组合为 LLM 可用的消息序列
 * - 任务计划集成 — 将活跃的 TaskPlan 注入上下文
 */

import { IMessage, IToolCall } from "../../models/Conversation.model";
import { config } from "../../config/env";
import { logger } from "../../lib/logger";
import {
  LlmMessage,
  MemoryState,
  ConversationSummary,
  TaskPlan,
  MEMORY_SLIDING_WINDOW,
  MEMORY_SUMMARY_THRESHOLD,
  MAX_CONTEXT_CHARS,
  TASK_STATUS,
} from "./agent.types";

const SUMMARY_PROMPT = `You are a conversation summarizer. Given a series of messages from a chat between a user and an AI assistant for a cloud drive platform, create a concise summary that captures:
1. Key user intents and requests
2. Important actions taken and their RESULTS — especially resource IDs, file names, folder names, share links, and any created/modified/moved resources
3. Any decisions made or preferences expressed
4. Current context (what file/folder the user is working with)
5. Unresolved requests, blocked actions, or items awaiting user confirmation

Rules:
- Be concise but preserve critical details
- ALWAYS include specific resource identifiers (file IDs, folder IDs, share links) from tool results
- For create/move/rename/share operations, preserve both the resource name AND its ID
- Preserve any unresolved requests or pending actions
- Output the summary in the same language as the conversation
- Maximum 300 words`;

// 从单个工具调用结果中提取关键资源信息
function summarizeOneToolCall(tc: IToolCall): string {
  if (!tc.result || tc.isError) {
    return tc.isError
      ? `FAILED: ${(tc.result || "unknown error").slice(0, 100)}`
      : "";
  }

  // 尝试解析 JSON 结果
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(tc.result);
  } catch {
    // 非 JSON 结果，取前 120 字符
    return tc.result.slice(0, 120);
  }

  if (!parsed || typeof parsed !== "object") return tc.result.slice(0, 120);

  // 提取常见的资源标识字段
  const parts: string[] = [];

  const id = parsed.id || parsed.fileId || parsed.folderId || parsed._id;
  const name = parsed.name || parsed.fileName || parsed.folderName;
  const link =
    parsed.link || parsed.shareLink || parsed.downloadUrl || parsed.url;
  const targetFolder = parsed.targetFolderId || parsed.destinationFolderId;

  if (name) parts.push(`"${String(name)}"`);
  if (id) parts.push(`(id: ${String(id)})`);
  if (targetFolder) parts.push(`→ folder ${String(targetFolder)}`);
  if (link) parts.push(`link: ${String(link)}`);

  // 对搜索结果，提取 resultCount
  const resultCount = parsed.resultCount ?? parsed.count ?? parsed.total;
  if (resultCount !== undefined) parts.push(`${resultCount} results`);

  return parts.length > 0 ? parts.join(" ") : tc.result.slice(0, 120);
}

// 为 assistant 消息生成紧凑的工具结果摘要块
function summarizeToolCalls(toolCalls: IToolCall[]): string {
  if (!toolCalls || toolCalls.length === 0) return "";

  const lines = toolCalls.map((tc) => {
    const summary = summarizeOneToolCall(tc);
    const status = tc.isError ? "❌" : "✅";
    return `${status} ${tc.toolName}: ${summary}`;
  });

  return `\n[Recent Actions]\n${lines.join("\n")}`;
}

async function generateSummary(messages: IMessage[]): Promise<string | null> {
  const apiKey = config.llmApiKey;
  const baseUrl = config.llmBaseUrl;
  const model = config.llmModel;

  if (!apiKey) return null;

  const formatted = messages
    .map((m) => {
      let text = `[${m.role}]: ${m.content}`;
      if (m.toolCalls?.length) {
        const toolSummaries = m.toolCalls.map((tc) => {
          const brief = summarizeOneToolCall(tc);
          return brief
            ? `  - ${tc.toolName}: ${brief}`
            : `  - ${tc.toolName}${tc.isError ? " (failed)" : ""}`;
        });
        text += `\n  [Tool Results]\n${toolSummaries.join("\n")}`;
      }
      return text;
    })
    .join("\n");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SUMMARY_PROMPT },
          {
            role: "user",
            content: `Summarize this conversation:\n\n${formatted}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "Summary generation failed");
      return null;
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    logger.warn({ error }, "Summary generation error");
    return null;
  }
}

export class MemoryManager {
  // 从完整消息历史构建 MemoryState

  // 如果消息数超过 MEMORY_SUMMARY_THRESHOLD：
  // 1. 对超出滑动窗口的旧消息生成摘要
  // 2. 保留最近 MEMORY_SLIDING_WINDOW 条消息
  async buildMemoryState(
    messages: IMessage[],
    existingSummaries: ConversationSummary[] = [],
    activePlan?: TaskPlan,
    lastCompletedPlanSummary?: string,
  ): Promise<MemoryState> {
    const totalCount = messages.length;

    if (totalCount <= MEMORY_SUMMARY_THRESHOLD) {
      return {
        summaries: existingSummaries,
        recentMessages: messages,
        activePlan,
        lastCompletedPlanSummary,
        totalMessageCount: totalCount,
      };
    }

    // 分离旧消息和新消息
    const cutoff = totalCount - MEMORY_SLIDING_WINDOW;
    const recentMessages = messages.slice(cutoff);

    // 检查是否需要新的摘要
    const lastSummarizedIdx =
      existingSummaries.length > 0
        ? existingSummaries[existingSummaries.length - 1].messageRange.to
        : 0;

    const newSummaries = [...existingSummaries];

    if (lastSummarizedIdx < cutoff) {
      // 有新的未摘要消息
      const unsummarized = messages.slice(lastSummarizedIdx, cutoff);
      if (unsummarized.length > 0) {
        const summaryText = await generateSummary(unsummarized);
        if (summaryText) {
          newSummaries.push({
            summary: summaryText,
            messageRange: { from: lastSummarizedIdx, to: cutoff },
            createdAt: new Date(),
          });

          logger.info(
            {
              range: `${lastSummarizedIdx}-${cutoff}`,
              summaryLength: summaryText.length,
            },
            "Generated conversation summary",
          );
        }
      }
    }

    return {
      summaries: newSummaries,
      recentMessages,
      activePlan,
      lastCompletedPlanSummary,
      totalMessageCount: totalCount,
    };
  }

  // 将 MemoryState 组装为 LLM 消息序列

  // 结构：
  //   [system prompt]
  //   [summary context]   if has summaries
  //   [task plan context] if has active plan
  //   [recent messages]   if has recent messages
  assembleLlmMessages(
    systemPrompt: string,
    memoryState: MemoryState,
  ): LlmMessage[] {
    const messages: LlmMessage[] = [{ role: "system", content: systemPrompt }];

    // 注入摘要上下文
    if (memoryState.summaries.length > 0) {
      const summaryBlock = memoryState.summaries
        .map(
          (s, i) =>
            `[Summary ${i + 1} (msgs ${s.messageRange.from}-${s.messageRange.to})]: ${s.summary}`,
        )
        .join("\n\n");

      messages.push({
        role: "system",
        content: `## Conversation History Summary\nThe following is a summary of earlier messages in this conversation:\n\n${summaryBlock}\n\n---\nRecent messages follow below.`,
      });
    }

    // 注入最近完成计划摘要（让 LLM 知道上一轮任务产出了什么）
    if (memoryState.lastCompletedPlanSummary) {
      messages.push({
        role: "system",
        content: `## Last Completed Task\n${memoryState.lastCompletedPlanSummary}\n\nUse the resource IDs above when the user refers to "this file", "that folder", or similar references from the previous task.`,
      });
    }

    // 注入任务计划
    if (memoryState.activePlan && !memoryState.activePlan.isComplete) {
      const planBlock = this.formatTaskPlan(memoryState.activePlan);
      messages.push({
        role: "system",
        content: `## Active Task Plan\n${planBlock}`,
      });
    }

    // 注入滑动窗口消息（含工具结果摘要）
    for (const msg of memoryState.recentMessages) {
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        // A1: 将工具调用结果摘要附加到 assistant 消息中
        let content = msg.content;
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          content += summarizeToolCalls(msg.toolCalls);
        }
        messages.push({ role: "assistant", content });
      } else if (msg.role === "system") {
        messages.push({ role: "system", content: msg.content });
      }
    }

    // 上下文窗口保护
    this.compressIfNeeded(messages);

    return messages;
  }

  // Router 轻量摘要：要取最近一个摘要（前文语义背景）+ 最近几条用户消息（最新需求）
  getRouterContext(memoryState: MemoryState): string | undefined {
    const parts: string[] = [];

    if (memoryState.summaries.length > 0) {
      const lastSummary =
        memoryState.summaries[memoryState.summaries.length - 1];
      parts.push(`Previous context: ${lastSummary.summary.slice(0, 200)}`);
    }

    const recentUserMsgs = memoryState.recentMessages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content.slice(0, 100));

    if (recentUserMsgs.length > 0) {
      parts.push(`Recent user messages: ${recentUserMsgs.join(" | ")}`);
    }

    return parts.length > 0 ? parts.join("\n") : undefined;
  }

  getPlanningContext(memoryState: MemoryState): string | undefined {
    const parts: string[] = [];

    if (memoryState.lastCompletedPlanSummary) {
      parts.push(
        `Last completed task:\n${memoryState.lastCompletedPlanSummary.slice(0, 600)}`,
      );
    }

    const recentAssistantMsg = [...memoryState.recentMessages]
      .reverse()
      .find((m) => m.role === "assistant");
    if (recentAssistantMsg?.content) {
      parts.push(
        `Most recent assistant output: ${recentAssistantMsg.content.slice(0, 400)}`,
      );
    }

    const recentUserMsgs = memoryState.recentMessages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content.slice(0, 150));

    if (recentUserMsgs.length > 0) {
      parts.push(`Recent user messages: ${recentUserMsgs.join(" | ")}`);
    }

    if (memoryState.summaries.length > 0) {
      const lastSummary =
        memoryState.summaries[memoryState.summaries.length - 1];
      parts.push(
        `Earlier conversation summary: ${lastSummary.summary.slice(0, 300)}`,
      );
    }

    return parts.length > 0 ? parts.join("\n\n") : undefined;
  }

  private formatTaskPlan(plan: TaskPlan): string {
    const lines = [`**Goal**: ${plan.goal}`];
    lines.push(
      `**Progress**: Step ${plan.currentStep} of ${plan.steps.length}`,
    );
    lines.push("");

    for (const step of plan.steps) {
      const statusIcon =
        step.status === TASK_STATUS.COMPLETED
          ? "✅"
          : step.status === TASK_STATUS.IN_PROGRESS
            ? "🔄"
            : step.status === TASK_STATUS.FAILED
              ? "❌"
              : step.status === TASK_STATUS.SKIPPED
                ? "⏭️"
                : "⬜";

      let line = `${statusIcon} Step ${step.id}: ${step.title}`;
      if (step.result) line += ` — ${step.result.slice(0, 80)}`;
      if (step.error) line += ` — Error: ${step.error.slice(0, 80)}`;
      lines.push(line);
    }

    if (plan.summary) {
      lines.push("");
      lines.push(`**Summary so far**: ${plan.summary}`);
    }

    return lines.join("\n");
  }

  private estimateChars(messages: LlmMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      if (msg.content) total += msg.content.length;
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          total += tc.function.arguments.length + tc.function.name.length;
        }
      }
    }
    return total;
  }

  compressIfNeeded(messages: LlmMessage[]): void {
    let totalChars = this.estimateChars(messages);
    if (totalChars <= MAX_CONTEXT_CHARS) return;

    logger.info(
      { totalChars, limit: MAX_CONTEXT_CHARS },
      "Memory manager: compressing context",
    );

    // 先压缩 tool 结果
    const KEEP_RECENT = 6;
    const shrinkBound = Math.max(1, messages.length - KEEP_RECENT);

    for (let i = 1; i < shrinkBound && totalChars > MAX_CONTEXT_CHARS; i++) {
      const msg = messages[i];
      if (msg.role === "tool" && msg.content && msg.content.length > 200) {
        const oldLen = msg.content.length;
        msg.content =
          msg.content.slice(0, 150) +
          `\n[...compressed — original ${oldLen} chars]`;
        totalChars -= oldLen - msg.content.length;
      }
    }

    if (totalChars <= MAX_CONTEXT_CHARS) return;

    // 再删除旧消息
    while (
      messages.length > KEEP_RECENT + 1 &&
      totalChars > MAX_CONTEXT_CHARS
    ) {
      const removed = messages.splice(1, 1)[0];
      if (removed.content) totalChars -= removed.content.length;
    }

    logger.info(
      { newTotalChars: totalChars, messageCount: messages.length },
      "Memory manager: context compressed",
    );
  }
}
