import {
  FileIcon,
  FileText,
  Music,
  Film,
  FileSpreadsheet,
  Presentation,
  FileCode,
  Image,
} from "lucide-react";
import type { FileCategory } from "@/lib/file-preview";

/**
 * Returns a lucide-react icon element for the given file category.
 * Shared across grid view, list view, and preview modal.
 */
export function getFileTypeIcon(
  category: FileCategory,
  className = "size-5 shrink-0 text-muted-foreground",
) {
  switch (category) {
    case "image":
      return <Image className={className} />;
    case "audio":
      return <Music className={className} />;
    case "video":
      return <Film className={className} />;
    case "pdf":
      return <FileText className={className} style={{ color: "#ef4444" }} />;
    case "document":
      return <FileText className={className} style={{ color: "#3b82f6" }} />;
    case "spreadsheet":
      return (
        <FileSpreadsheet className={className} style={{ color: "#22c55e" }} />
      );
    case "presentation":
      return (
        <Presentation className={className} style={{ color: "#f97316" }} />
      );
    case "code":
    case "markdown":
      return <FileCode className={className} />;
    case "text":
      return <FileText className={className} />;
    default:
      return <FileIcon className={className} />;
  }
}
