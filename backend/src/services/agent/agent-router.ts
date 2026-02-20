/**
 * Agent Router
 *
 * 路由优先级：
 *   1. 来自前端的显式上下文（context.type = 'drive' | 'document'）
 *   2. 存储的会话上下文（如果继续会话）
 *   3. 对用户消息的模式匹配
 *   4. 默认：drive Agent
 */

import { AgentType } from "./agent.types";
import { logger } from "../../lib/logger";

const DOCUMENT_PATTERNS = [
  // Writing / Editing
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

const DRIVE_PATTERNS = [
  // File / Folder
  /\b(create|make|new)\s+(a\s+)?(file|folder|directory|document|spreadsheet|presentation)\b/i,
  /\b(delete|remove|trash|restore)\s+(the\s+)?(file|folder|directory|all)\b/i,
  /\b(move|copy|rename)\s+(the\s+)?(file|folder|directory|it)\b/i,
  /\b(share|unshare|permission|access)\b/i,
  /\b(search|find|look\s+for|locate)\s+(files?|folders?|documents?)\b/i,
  /\b(list|show|display)\s+(my\s+)?(files?|folders?|directory|contents?|starred|trashed|recent)\b/i,
  /\b(download|upload|star|unstar)\b/i,
  /\b(index|semantic\s+search)\b/i,
  /\b(创建|删除|移动|重命名|分享|搜索|查找|列出|下载|上传|收藏|回收站|文件夹|共享)\b/,
  /\b(share\s+link|share\s+with)\b/i,
  /\bhow\s+(many|much)\s+(files?|folders?|space|storage)\b/i,
];

/**
 * Route a chat request to the appropriate agent type.
 */
export function routeToAgent(params: {
  explicitType?: AgentType;
  conversationAgentType?: AgentType;
  message: string;
}): AgentType {
  const { explicitType, conversationAgentType, message } = params;

  // 1. Explicit context from frontend takes highest priority
  if (explicitType) {
    logger.debug(
      { agentType: explicitType, source: "explicit" },
      "Agent routed via explicit context",
    );
    return explicitType;
  }

  // 2. Continue with existing conversation's agent type
  if (conversationAgentType) {
    logger.debug(
      { agentType: conversationAgentType, source: "conversation" },
      "Agent routed via conversation context",
    );
    return conversationAgentType;
  }

  // 3. Pattern matching on message
  let docScore = 0;
  let driveScore = 0;

  for (const pattern of DOCUMENT_PATTERNS) {
    if (pattern.test(message)) docScore++;
  }

  for (const pattern of DRIVE_PATTERNS) {
    if (pattern.test(message)) driveScore++;
  }

  if (docScore > 0 && docScore > driveScore) {
    logger.debug(
      { docScore, driveScore, source: "pattern" },
      "Agent routed to document agent via pattern matching",
    );
    return "document";
  }

  if (driveScore > 0) {
    logger.debug(
      { docScore, driveScore, source: "pattern" },
      "Agent routed to drive agent via pattern matching",
    );
    return "drive";
  }

  // 4. Default to drive
  logger.debug({ source: "default" }, "Agent routed to drive agent by default");
  return "drive";
}
