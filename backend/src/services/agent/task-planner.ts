/**
 * Task Planner 任务分解与执行跟踪
 *
 *   1. 判断用户请求是否需要任务分解（Regex 快路径 + LLM 兜底）
 *   2. 使用 LLM 将复杂请求拆解为有序步骤
 *   3. 跟踪每个步骤的执行状态
 *   4. 将任务计划注入到 Agent 上下文中，引导 Agent 按步骤执行
 *
 * 触发条件：
 *   - 显式多步：用户消息包含多个意图（"先…然后…"）
 *   - 隐式多步：看似简单但需要跨域操作（搜索+阅读+写入）
 *   - 批量操作：涉及多文件/多步骤
 *   - 条件性操作
 *
 * 判断流程：
 *   regex 匹配 -> 命中则直接 plan
 *             未命中 -> LLM 复杂度分类器 -> 判定是否需要 plan
 *
 * TaskPlan 会被注入到 Memory 中传递给 Agent，Agent 在执行过程中
 * 通过回调更新步骤状态。
 */

import { config } from "../../config/env";
import { logger } from "../../lib/logger";
import {
  AgentType,
  TaskPlan,
  TaskStep,
  TaskStatus,
  TASK_STATUS,
  TASK_COMPLEXITY_THRESHOLD,
} from "./agent.types";

const MULTI_STEP_PATTERNS = [
  // 序列操作
  /\b(first|then|after that|next|finally|lastly|and then)\b/i,
  /\b(先|然后|接着|最后|之后|再|并且|同时)\b/,
  // 多步操作
  /\b(and|also|plus|as well as|in addition|additionally)\b.*\b(create|delete|move|rename|share|edit|write|search|find|index)/i,
  /\b(所有|全部|每个|批量|一起)\b/,
  // 批量操作
  /\b(all|every|each|batch|multiple|several)\s+(files?|folders?|documents?)\b/i,
  // 条件操作
  /\b(if|when|unless|in case)\b.*\b(then|otherwise|else)\b/i,
  /\b(如果|要是|假如)\b.*\b(就|那么|否则)\b/,
];

export function needsTaskPlanning(message: string): boolean {
  let matches = 0;
  for (const pattern of MULTI_STEP_PATTERNS) {
    if (pattern.test(message)) matches++;
  }
  return matches >= TASK_COMPLEXITY_THRESHOLD;
}

const SIMPLE_REQUEST_PATTERNS = [
  /^(list|show|display)\s+(my\s+)?(files?|folders?|contents?|starred|trashed|recent)\s*$/i,
  /^(create|make|new)\s+(a\s+)?(file|folder|directory)\s+/i,
  /^(delete|rename|move|star|trash|restore)\s+/i,
  /^(search|find)\s+(for\s+)?[\w.\-]+\s*$/i,
  /^(who\s*am\s*i|get\s+status|help)\s*$/i,
  /^(列出|显示|查看)(文件|文件夹|目录|收藏|回收站)\s*$/,
];

function isSimpleRequest(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 15) return true; // 非常短的消息通常是简单请求
  return SIMPLE_REQUEST_PATTERNS.some((p) => p.test(trimmed));
}

// LLM 复杂分类器

const COMPLEXITY_CLASSIFIER_PROMPT = `You are a task complexity classifier for a cloud drive AI assistant.
Determine whether the user's request requires a MULTI-STEP plan or can be handled as a SINGLE action.

IMPORTANT CONTEXT: The user may be in one of two environments:
- **Document Editor**: Currently viewing/editing a specific file. Context will include "currentFileId".
- **Drive Browser**: Browsing files/folders. No currentFileId.

Reference resolution rules:
- If the user says "this", "that", "these", "上面的内容", "这些东西", or similar follow-up wording, resolve it against the recent conversation and most recent assistant result first.
- Attached resources or the current folder are fallback context, not the default meaning of ambiguous follow-up references.
- Do NOT reinterpret a follow-up writing request as "summarize the attached folder" unless the user explicitly mentions the folder/resources.

A request NEEDS task planning (multi-step) when:
- It implicitly requires operations across different domains. Examples:
  * "write a summary of file X" → needs: search(both semantic and keyword)/find file → read content → write summary (3 domains)
  * "translate the MongoDB doc in my drive" → needs: search file → read → edit (cross-domain)
  * "find all PDFs and move them to archive" → needs: search → batch move (cross-domain)
- The user is uncertain about details, requiring discovery first:
  * "I forgot the filename" → must search before acting
  * "somewhere in my drive" → must locate before acting
- It involves conditional logic or dependencies between operations

A request does NOT need planning (single action) when:
- It's a direct, self-contained operation: "list my files", "create a folder called X", "search for report.pdf"
- It's a simple question: "how many files do I have?"
- It's a direct edit on the CURRENT document (when currentFileId is present): "add a title", "translate this", "append a paragraph"
- The target file/folder is explicitly identified by name or ID

Respond with ONLY a JSON object. No extra text.
{"needs_plan": true, "reason": "brief one-sentence explanation"}`;

async function llmNeedsPlan(
  message: string,
  context?: string,
): Promise<boolean> {
  const apiKey = config.llmApiKey;
  const baseUrl = config.llmBaseUrl;
  const model = config.llmModel;

  if (!apiKey) return false;

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: COMPLEXITY_CLASSIFIER_PROMPT },
  ];

  if (context) {
    messages.push({
      role: "system",
      content: `Current user context:\n${context}`,
    });
  }

  messages.push({
    role: "user",
    content: `Classify this request:\n"${message}"`,
  });

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: 120,
      }),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "LLM complexity classifier call failed",
      );
      return false;
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return false;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return false;

    const parsed = JSON.parse(jsonMatch[0]) as {
      needs_plan: boolean;
      reason: string;
    };

    logger.debug(
      { needsPlan: parsed.needs_plan, reason: parsed.reason },
      "LLM complexity classification result",
    );

    return !!parsed.needs_plan;
  } catch (error) {
    logger.warn(
      { error },
      "LLM complexity classifier error, defaulting to no plan",
    );
    return false;
  }
}

export async function shouldPlanTask(
  message: string,
  context?: string,
): Promise<boolean> {
  if (isSimpleRequest(message)) {
    logger.debug("Simple request detected, skipping task planning");
    return false;
  }

  if (needsTaskPlanning(message)) {
    logger.debug("Multi-step pattern detected via regex");
    return true;
  }

  return llmNeedsPlan(message, context);
}

const PLANNER_PROMPT = `You are a task planner for a cloud drive AI assistant. Given a complex user request, break it down into the MINIMUM number of strictly sequential steps.

## Core Rules
1. **MINIMIZE STEPS** — combine related work into as few steps as possible. The ideal plan has 2-3 steps, NEVER more than 5.
2. **STRICTLY SEQUENTIAL** — all steps execute in order: Step 1 → Step 2 → Step 3. Each step starts only after the previous one completes.
3. Include the appropriate agent type for each step:
   - "search" for finding files, semantic search, reading file content, knowledge queries, batch file extraction
   - "drive" for file/folder CRUD: create (with content!), delete, move, rename, share
   - "document" for editing the CURRENT open document only (patch operations)
4. Keep step titles short (under 50 chars)
5. Respond ONLY with valid JSON

## Reference Resolution Rules
- Resolve follow-up references like "this", "that", "these things", "上面的内容", "这些东西", or "刚才那个" against recent conversation results first.
- Attached files/folders are source materials, not the default target of ambiguous pronouns.
- Only generate a folder summarization step when the user explicitly asks about a folder, directory, or attached resources themselves.

## CRITICAL TOOL KNOWLEDGE — Batch Tools (Most Important!)
The system has powerful batch tools that process multiple items in a SINGLE call. **ALWAYS prefer batch tools over generating separate steps for each file.**

- **\`batch_extract_file_contents\`** (search agent): Reads multiple files at once. Pass an array of file IDs → returns all contents concatenated in Markdown format. **Use this when a task requires reading 2+ files before writing/analyzing.**
- **\`map_reduce_summarize\`** (search agent): Summarizes an entire folder or large batch of files. Accepts \`drive://folders/{folderId}\` URI directly. **This is the ONLY correct tool for "summarize this folder" or "analyze all files in X" requests.** It handles chunking, parallelism, and merging internally — treat it as a black box.
- The "drive" agent's \`create_file\` tool accepts a \`content\` parameter. You can create a file WITH content in ONE step.
- The "search" agent has \`extract_file_content\` for reading a single file.
- The "search" agent has \`search_files\` (by name) and \`semantic_search_files\` (by content/meaning).

## Planning Strategy by Intent

| User Intent | Correct Plan |
|---|---|
| "Summarize all files in folder X" / "What's in this folder?" | **1 step**: search agent calls \`map_reduce_summarize\` with \`drive://folders/{folderId}\` |
| "Summarize/analyze these 5+ files" | **1 step**: search agent calls \`map_reduce_summarize\` |
| "Read files A, B, C and write a comparison" | **Step 1**: search agent calls \`batch_extract_file_contents\` with all file IDs; **Step 2**: drive agent creates result file using the extracted content |
| "Find all PDFs and move them to Archive" | **Step 1**: search agent finds PDFs; **Step 2**: drive agent moves them |
| "Write a summary based on file X" | **Step 1**: search agent reads file X; **Step 2**: drive agent creates summary file |

## FORBIDDEN Patterns (NEVER generate these)
- ❌ Separate steps for reading individual files: "Read file A", "Read file B", "Read file C" → Use batch_extract_file_contents in ONE step
- ❌ Splitting file creation and writing: "Create file" then "Write content" → Use create_file with content in ONE step
- ❌ "Open file" or "Open document" as a standalone step — there is no open action
- ❌ Splitting writing into parts: "Write header", "Write body", "Write conclusion" → ONE step
- ❌ More than 5 steps for any task

## Context Rules
- If context includes "currentFileId", the "document" agent edits THAT file only. Don't create new files.
- The "document" agent does NOT create/delete/move files — only the "drive" agent does.
- When editing the current document, 1-2 steps is typical.
- \`patch_file\` FAILS on empty files. For new files with content, use \`create_file\` with content parameter.

## Output Format
{
  "goal": "<overall goal in user's language>",
  "steps": [
    {
      "id": 1,
      "title": "<short action title>",
      "description": "<what to do, with specific tool recommendations>",
      "agentType": "drive|document|search"
    }
  ]
}

## Examples

User: "Summarize all CS224n files in the drive"
{
  "goal": "Summarize all CS224n files",
  "steps": [
    {"id": 1, "title": "Search for CS224n files", "description": "Use semantic_search_files to find all CS224n-related files", "agentType": "search"},
    {"id": 2, "title": "Extract and summarize all found files", "description": "Use batch_extract_file_contents to read all found files at once, then summarize the key points", "agentType": "search"},
    {"id": 3, "title": "Create summary document", "description": "Create a new markdown file with the complete summary using create_file with content", "agentType": "drive"}
  ]
}

User: "Summarize everything in my reports folder"
{
  "goal": "Summarize the reports folder",
  "steps": [
    {"id": 1, "title": "Summarize reports folder", "description": "Use map_reduce_summarize with drive://folders/{reportsId} to get a comprehensive summary of all files", "agentType": "search"}
  ]
}

User: "Read report.pdf and budget.xlsx and compare them"
{
  "goal": "Compare report.pdf and budget.xlsx",
  "steps": [
    {"id": 1, "title": "Read both files", "description": "Use batch_extract_file_contents with both file IDs to read report.pdf and budget.xlsx simultaneously", "agentType": "search"},
    {"id": 2, "title": "Create comparison", "description": "Create a comparison document based on the extracted contents using create_file with content", "agentType": "drive"}
  ]
}`;

//使用 LLM 将复杂请求分解为任务步骤
export async function generateTaskPlan(
  message: string,
  context?: string,
): Promise<TaskPlan | null> {
  const apiKey = config.llmApiKey;
  const baseUrl = config.llmBaseUrl;
  const model = config.llmModel;

  if (!apiKey) return null;

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: PLANNER_PROMPT },
  ];

  if (context) {
    messages.push({
      role: "system",
      content: `Current context:\n${context}`,
    });
  }

  messages.push({
    role: "user",
    content: `Break down this request into steps:\n"${message}"`,
  });

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "Task plan generation failed");
      return null;
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      goal: string;
      steps: Array<{
        id: number;
        title: string;
        description: string;
        agentType?: string;
      }>;
    };

    if (!parsed.steps || parsed.steps.length === 0) return null;

    const steps: TaskStep[] = parsed.steps.map((s, i) => ({
      id: i + 1,
      title: s.title,
      description: s.description,
      status: TASK_STATUS.PENDING,
      agentType: (["drive", "document", "search"].includes(s.agentType || "")
        ? s.agentType
        : undefined) as AgentType | undefined,
    }));

    const plan: TaskPlan = {
      goal: parsed.goal,
      steps,
      currentStep: 1,
      isComplete: false,
    };

    logger.info(
      { goal: plan.goal, stepCount: plan.steps.length },
      "Task plan generated",
    );

    return plan;
  } catch (error) {
    logger.warn({ error }, "Task plan generation error");
    return null;
  }
}

export class TaskPlanTracker {
  startCurrentStep(plan: TaskPlan): TaskPlan {
    const updated = { ...plan, steps: [...plan.steps] };
    const step = updated.steps.find((s) => s.id === plan.currentStep);
    if (step) {
      step.status = TASK_STATUS.IN_PROGRESS;
    }
    return updated;
  }

  completeCurrentStep(plan: TaskPlan, result?: string): TaskPlan {
    const updated = { ...plan, steps: [...plan.steps] };
    const step = updated.steps.find((s) => s.id === plan.currentStep);

    if (step) {
      step.status = TASK_STATUS.COMPLETED;
      step.result = result;
    }

    // 推进到下一步
    const nextPending = updated.steps.find(
      (s) => s.status === TASK_STATUS.PENDING,
    );
    if (nextPending) {
      updated.currentStep = nextPending.id;
    } else {
      updated.isComplete = true;
    }

    return updated;
  }

  failCurrentStep(plan: TaskPlan, error: string): TaskPlan {
    const updated = { ...plan, steps: [...plan.steps] };
    const step = updated.steps.find((s) => s.id === plan.currentStep);

    if (step) {
      step.status = TASK_STATUS.FAILED;
      step.error = error;
    }

    // 继续尝试下一步
    const nextPending = updated.steps.find(
      (s) => s.status === TASK_STATUS.PENDING,
    );
    if (nextPending) {
      updated.currentStep = nextPending.id;
    } else {
      updated.isComplete = true;
    }

    return updated;
  }

  skipCurrentStep(plan: TaskPlan, reason?: string): TaskPlan {
    const updated = { ...plan, steps: [...plan.steps] };
    const step = updated.steps.find((s) => s.id === plan.currentStep);

    if (step) {
      step.status = TASK_STATUS.SKIPPED;
      step.result = reason || "Skipped";
    }

    const nextPending = updated.steps.find(
      (s) => s.status === TASK_STATUS.PENDING,
    );
    if (nextPending) {
      updated.currentStep = nextPending.id;
    } else {
      updated.isComplete = true;
    }

    return updated;
  }

  getProgressSummary(plan: TaskPlan): string {
    const completed = plan.steps.filter(
      (s) => s.status === TASK_STATUS.COMPLETED,
    ).length;
    const failed = plan.steps.filter(
      (s) => s.status === TASK_STATUS.FAILED,
    ).length;
    const total = plan.steps.length;

    const parts = [`Progress: ${completed}/${total} completed`];
    if (failed > 0) parts.push(`${failed} failed`);

    if (plan.isComplete) {
      parts.push("— Plan complete!");
    } else {
      const current = plan.steps.find((s) => s.id === plan.currentStep);
      if (current) {
        parts.push(`— Current: ${current.title}`);
      }
    }

    return parts.join(" ");
  }

  formatPlanForUser(plan: TaskPlan): string {
    const lines: string[] = [];
    lines.push(`📋 **Task Plan**: ${plan.goal}`);
    lines.push("");

    for (const step of plan.steps) {
      const icon =
        step.status === TASK_STATUS.COMPLETED
          ? "✅"
          : step.status === TASK_STATUS.IN_PROGRESS
            ? "🔄"
            : step.status === TASK_STATUS.FAILED
              ? "❌"
              : step.status === TASK_STATUS.SKIPPED
                ? "⏭️"
                : "⬜";

      let line = `${icon} **Step ${step.id}**: ${step.title}`;
      if (step.status === TASK_STATUS.COMPLETED && step.result) {
        line += `\n   _${step.result.slice(0, 120)}_`;
      }
      if (step.status === TASK_STATUS.FAILED && step.error) {
        line += `\n   ⚠️ _${step.error.slice(0, 120)}_`;
      }
      lines.push(line);
    }

    lines.push("");
    lines.push(this.getProgressSummary(plan));

    return lines.join("\n");
  }
}
