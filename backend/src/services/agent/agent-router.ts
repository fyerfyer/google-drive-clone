/**
 * Agent Router — Hybrid 路由策略
 *
 * 路由优先级：
 *   1. 来自前端的显式上下文（context.type = 'drive' | 'document' | 'search'）
 *   2. 对用户消息的模式匹配
 *      - 如果高置信度模式匹配指向不同于会话当前 agent 的类型，以模式匹配为准
 *   3. 存储的会话上下文（如果继续会话且无强模式匹配冲突）
 *   4. LLM Router（低置信度时调用轻量 LLM 做意图分类）
 *   5. 默认：drive Agent
 */

import {
  AgentType,
  RouteDecision,
  AGENT_REGISTRY,
  PATTERN_CONFIDENCE_THRESHOLD,
} from "./agent.types";
import { config } from "../../config/env";
import { logger } from "../../lib/logger";

const DOCUMENT_PATTERNS = [
  /\b(write|edit|draft|compose|rewrite|proofread|revise|redraft)\b/i,
  /\b(add|append|prepend|insert)\s+(text|content|paragraph|section|line|sentence)/i,
  /\b(modify|change|update|fix|correct)\s+(the\s+)?(text|content|document|paragraph)/i,
  /\b(write|tell)\s+(me\s+)?(a\s+)?(story|article|essay|poem|report|letter|email|summary)/i,
  /\b(translate|rephrase|paraphrase|simplify|expand)\b/i,
  /\b(文档|编辑|修改|撰写|写|改写|润色|翻译|添加|追加|插入|删除文字|删除段落)\b/,
  /\b(patch|diff)\b/i,
  /\bin\s+(this|the)\s+(document|file|text|doc)\b/i,
  /\b(spell.?check|grammar|format\s+text)\b/i,
];

const SEARCH_PATTERNS = [
  /\b(search|find|look\s+for|locate|query)\s+(files?|folders?|documents?|content)\b/i,
  /\b(semantic\s+search|knowledge\s+base|knowledge\s+query)\b/i,
  /\b(index|reindex|indexing|embedding)\b/i,
  /\b(summarize|summary)\s+(directory|folder|workspace)\b/i,
  /\b(搜索|查找|检索|语义搜索|知识库|索引|查询知识)\b/,
  /\bwhat\s+(files?|documents?)\s+(contain|have|mention|about)\b/i,
  /\b(find|show)\s+(me\s+)?(everything|all|anything)\s+(about|related|similar|matching)\b/i,
  /\bRAG\b/i,
];

const DRIVE_PATTERNS = [
  /\b(create|make|new)\s+(a\s+)?(file|folder|directory|document|spreadsheet|presentation)\b/i,
  /\b(delete|remove|trash|restore)\s+(the\s+)?(file|folder|directory|all)\b/i,
  /\b(move|copy|rename)\s+(the\s+)?(file|folder|directory|it)\b/i,
  /\b(share|unshare|permission|access)\b/i,
  /\b(list|show|display)\s+(my\s+)?(files?|folders?|directory|contents?|starred|trashed|recent)\b/i,
  /\b(download|upload|star|unstar)\b/i,
  /\b(创建|删除|移动|重命名|分享|列出|下载|上传|收藏|回收站|文件夹|共享)\b/,
  /\b(share\s+link|share\s+with)\b/i,
  /\bhow\s+(many|much)\s+(files?|folders?|space|storage)\b/i,
];

interface PatternScore {
  type: AgentType;
  score: number;
  total: number;
}

function calculatePatternScores(message: string): PatternScore[] {
  const scores: PatternScore[] = [];

  let docScore = 0;
  for (const p of DOCUMENT_PATTERNS) if (p.test(message)) docScore++;
  scores.push({
    type: "document",
    score: docScore,
    total: DOCUMENT_PATTERNS.length,
  });

  let searchScore = 0;
  for (const p of SEARCH_PATTERNS) if (p.test(message)) searchScore++;
  scores.push({
    type: "search",
    score: searchScore,
    total: SEARCH_PATTERNS.length,
  });

  let driveScore = 0;
  for (const p of DRIVE_PATTERNS) if (p.test(message)) driveScore++;
  scores.push({
    type: "drive",
    score: driveScore,
    total: DRIVE_PATTERNS.length,
  });

  return scores.sort((a, b) => b.score - a.score);
}

function getConfidence(scores: PatternScore[]): number {
  if (scores.length < 2) return scores[0]?.score > 0 ? 1 : 0;
  const top = scores[0].score;
  const second = scores[1].score;
  if (top === 0) return 0;
  if (second === 0) return Math.min(top / 3, 1);
  return (top - second) / (top + second);
}

const LLM_ROUTER_PROMPT = `You are a routing classifier for a cloud drive application's AI agent system.
Your task is to determine which specialized agent should handle the user's request.

Available agents:
${AGENT_REGISTRY.map(
  (a) =>
    `- "${a.type}": ${a.description}\n  Capabilities: ${a.capabilities.join(", ")}`,
).join("\n")}

Rules:
1. Respond ONLY with a valid JSON object, no extra text.
2. The "route_to" field must be one of: ${AGENT_REGISTRY.map((a) => `"${a.type}"`).join(", ")}.
3. "confidence" is a float between 0 and 1.
4. "reason" is a brief explanation in the user's language.

Output format:
{"route_to": "<agent_type>", "confidence": <float>, "reason": "<brief_reason>"}`;

async function callLlmRouter(
  message: string,
  conversationContext?: string,
): Promise<RouteDecision | null> {
  const apiKey = config.llmApiKey;
  const baseUrl = config.llmBaseUrl;
  const model = config.llmModel;

  if (!apiKey) return null;

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: LLM_ROUTER_PROMPT },
  ];

  if (conversationContext) {
    messages.push({
      role: "system",
      content: `Recent conversation context:\n${conversationContext}`,
    });
  }

  messages.push({
    role: "user",
    content: `Classify this user request:\n"${message}"`,
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
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "LLM Router call failed");
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
      route_to: string;
      confidence: number;
      reason: string;
    };

    const validTypes: AgentType[] = ["drive", "document", "search"];
    if (!validTypes.includes(parsed.route_to as AgentType)) {
      return null;
    }

    return {
      route_to: parsed.route_to as AgentType,
      confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
      reason: parsed.reason || "LLM classification",
      source: "llm",
    };
  } catch (error) {
    logger.warn({ error }, "LLM Router classification failed, falling back");
    return null;
  }
}

export async function routeToAgent(params: {
  explicitType?: AgentType;
  conversationAgentType?: AgentType;
  message: string;
  conversationContext?: string;
}): Promise<RouteDecision> {
  const { explicitType, conversationAgentType, message, conversationContext } =
    params;

  if (explicitType) {
    logger.debug(
      { agentType: explicitType, source: "explicit" },
      "Agent routed via explicit context",
    );
    return {
      route_to: explicitType,
      confidence: 1,
      reason: "Explicit context from frontend",
      source: "explicit",
    };
  }

  // 先做模式匹配，再决定是否尊重会话粘性
  const scores = calculatePatternScores(message);
  const confidence = getConfidence(scores);
  const topScore = scores[0];

  // 如果模式匹配高置信度命中，优先使用，即使与会话类型不同
  if (topScore.score > 0 && confidence >= PATTERN_CONFIDENCE_THRESHOLD) {
    logger.debug(
      {
        agentType: topScore.type,
        confidence,
        scores: scores.map((s) => `${s.type}:${s.score}`),
        source: "pattern",
        overriddenConversation:
          conversationAgentType && conversationAgentType !== topScore.type,
      },
      "Agent routed via high-confidence pattern matching",
    );
    return {
      route_to: topScore.type,
      confidence,
      reason: `Pattern matching (score: ${topScore.score}, confidence: ${confidence.toFixed(2)})`,
      source: "pattern",
    };
  }

  // 模式匹配不强，与前面的会话趋同
  if (conversationAgentType) {
    logger.debug(
      { agentType: conversationAgentType, source: "conversation" },
      "Agent routed via conversation context (no strong pattern override)",
    );
    return {
      route_to: conversationAgentType,
      confidence: 0.9,
      reason: "Continuing existing conversation",
      source: "conversation",
    };
  }

  // 无会话上下文、无高置信度模式： 调用 LLM Router
  logger.debug(
    { patternConfidence: confidence, topScore: topScore.score },
    "Low-confidence pattern match, invoking LLM Router",
  );

  const llmDecision = await callLlmRouter(message, conversationContext);
  if (llmDecision) {
    logger.info(
      {
        agentType: llmDecision.route_to,
        confidence: llmDecision.confidence,
        reason: llmDecision.reason,
      },
      "Agent routed via LLM Router",
    );
    return llmDecision;
  }

  if (topScore.score > 0) {
    return {
      route_to: topScore.type,
      confidence: confidence || 0.3,
      reason: "Low-confidence pattern fallback (LLM Router unavailable)",
      source: "pattern",
    };
  }

  logger.debug({ source: "default" }, "Agent routed to drive agent by default");
  return {
    route_to: "drive",
    confidence: 0.2,
    reason: "Default routing (no pattern match, LLM Router unavailable)",
    source: "default",
  };
}
