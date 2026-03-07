import { Brain, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import {
  useEmbeddingSummary,
  useEmbeddingSocket,
} from "@/hooks/useEmbeddingStatus";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function EmbeddingProgressBar() {
  useEmbeddingSocket();
  const { data } = useEmbeddingSummary();
  const [expanded, setExpanded] = useState(false);

  if (!data || data.activeCount === 0) return null;

  return (
    <div className="border rounded-lg bg-card text-card-foreground shadow-sm mx-4 mb-2 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
      >
        <Loader2 className="size-3.5 text-amber-500 animate-spin shrink-0" />
        <span className="font-medium truncate">
          Indexing {data.activeCount} file{data.activeCount > 1 ? "s" : ""} for
          AI search…
        </span>
        <span className="ml-auto shrink-0">
          {expanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </span>
      </button>

      {/* Expanded file list */}
      {expanded && (
        <div className="border-t px-3 py-1.5 max-h-40 overflow-y-auto space-y-1">
          {data.files.map((file) => (
            <div
              key={file.fileId}
              className="flex items-center gap-2 text-xs text-muted-foreground py-0.5"
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {file.status === "processing" ? (
                      <Loader2 className="size-3 text-amber-500 animate-spin shrink-0" />
                    ) : (
                      <Brain className="size-3 text-muted-foreground shrink-0" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs">
                      {file.status === "processing" ? "Processing" : "Queued"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="truncate flex-1">{file.fileName}</span>
              <span className="shrink-0 text-[10px]">
                {file.status === "processing" ? "processing" : "queued"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
