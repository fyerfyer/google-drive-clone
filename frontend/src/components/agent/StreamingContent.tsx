import { IconRobot } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface StreamingContentProps {
  content: string;
  /** When true, renders without the avatar wrapper (used inside StreamingResponse) */
  inline?: boolean;
}

export function StreamingContent({ content, inline }: StreamingContentProps) {
  if (!content) return null;

  const markdownBlock = (
    <div className="rounded-xl bg-muted text-foreground px-3.5 py-2.5 text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-pre:bg-background prose-pre:border prose-pre:text-[12px] prose-code:text-[12px] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-background prose-code:before:content-none prose-code:after:content-none prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-hr:my-2 prose-table:text-xs">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      <span className="inline-block size-2 rounded-full bg-primary animate-pulse ml-0.5 align-middle" />
    </div>
  );

  if (inline) {
    return markdownBlock;
  }

  return (
    <div className="flex gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
        <IconRobot className="size-4" />
      </div>
      <div className="flex-1 min-w-0">{markdownBlock}</div>
    </div>
  );
}
