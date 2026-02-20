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
- It's a direct edit on the CURRENT document: "add a title to this document", "translate this text"
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
/**
 * 综合判断是否需要任务拆分。
 *
 * 判断优先级：
 *   1. 简单请求快速放行
 *   2. Regex 多步模式命中 
 *   3. 最后使用 LLM 复杂分类器
 */
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

const PLANNER_PROMPT = `You are a task planner for a cloud drive AI assistant. Given a complex user request, break it down into clear, ordered steps that the AI agent can execute one by one.

Rules:
1. Each step should be a single, atomic action
2. Steps should be in logical execution order
3. Include the appropriate agent type for each step:
   - "drive" for file/folder operations (create, delete, move, rename, share, etc.)
   - "document" for text editing operations (write, edit, patch, translate, etc.)
   - "search" for search/retrieval operations (find files, semantic search, knowledge query, etc.)
4. Keep step titles short (under 50 chars) and descriptions clear
5. Maximum 8 steps per plan
6. Respond ONLY with valid JSON

Output format:
{
  "goal": "<overall goal in user's language>",
  "steps": [
    {
      "id": 1,
      "title": "<short action title>",
      "description": "<what to do, with specific details>",
      "agentType": "drive|document|search"
    }
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
      status: "pending" as TaskStatus,
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
      step.status = "in-progress";
    }
    return updated;
  }

  completeCurrentStep(plan: TaskPlan, result?: string): TaskPlan {
    const updated = { ...plan, steps: [...plan.steps] };
    const step = updated.steps.find((s) => s.id === plan.currentStep);

    if (step) {
      step.status = "completed";
      step.result = result;
    }

    // 推进到下一步
    const nextPending = updated.steps.find((s) => s.status === "pending");
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
      step.status = "failed";
      step.error = error;
    }

    // 继续尝试下一步
    const nextPending = updated.steps.find((s) => s.status === "pending");
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
      step.status = "skipped";
      step.result = reason || "Skipped";
    }

    const nextPending = updated.steps.find((s) => s.status === "pending");
    if (nextPending) {
      updated.currentStep = nextPending.id;
    } else {
      updated.isComplete = true;
    }

    return updated;
  }

  getProgressSummary(plan: TaskPlan): string {
    const completed = plan.steps.filter((s) => s.status === "completed").length;
    const failed = plan.steps.filter((s) => s.status === "failed").length;
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
        step.status === "completed"
          ? "✅"
          : step.status === "in-progress"
            ? "🔄"
            : step.status === "failed"
              ? "❌"
              : step.status === "skipped"
                ? "⏭️"
                : "⬜";

      let line = `${icon} **Step ${step.id}**: ${step.title}`;
      if (step.status === "completed" && step.result) {
        line += `\n   _${step.result.slice(0, 120)}_`;
      }
      if (step.status === "failed" && step.error) {
        line += `\n   ⚠️ _${step.error.slice(0, 120)}_`;
      }
      lines.push(line);
    }

    lines.push("");
    lines.push(this.getProgressSummary(plan));

    return lines.join("\n");
  }
}
