import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { Worker, Viewer } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import {
  Download,
  Loader2,
  Pencil,
  X,
  FileText,
  Music,
  Film,
  FileSpreadsheet,
  Presentation,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { triggerDownload } from "@/lib/download";
import { toast } from "sonner";
import { OnlyOfficeEditor } from "@/components/editor/OnlyOfficeEditor";
import type { FileCategory } from "@/lib/file-preview";
import { TextEditor } from "@/components/editor/TextEditor";
import type { IFile } from "@/types/file.types";
import { fileService } from "@/services/file.service";
import { useFilePreview } from "@/hooks/editor/useFilePreview";
import { useEscapeKey } from "@/hooks/editor/useKeyboardShortcuts";
import { useEffect } from "react";

const ONLYOFFICE_URL = import.meta.env.VITE_ONLYOFFICE_URL || "";

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: IFile | null;
}

/** Icon for file type shown in the header */
function getFileIcon(category: FileCategory) {
  switch (category) {
    case "audio":
      return <Music className="h-5 w-5" />;
    case "video":
      return <Film className="h-5 w-5" />;
    case "spreadsheet":
      return <FileSpreadsheet className="h-5 w-5" />;
    case "presentation":
      return <Presentation className="h-5 w-5" />;
    case "code":
    case "markdown":
      return <FileCode className="h-5 w-5" />;
    default:
      return <FileText className="h-5 w-5" />;
  }
}

/** Format file size */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const FilePreviewModal = ({
  isOpen,
  onClose,
  file,
}: FilePreviewModalProps) => {
  const navigate = useNavigate();

  // Use the new file preview hook
  const {
    url,
    officeUrl,
    onlyOfficeToken,
    textContent,
    isLoading,
    error,
    fileCategory,
    canOpenInEditor,
    useOnlyOffice,
  } = useFilePreview({
    file,
    isOpen,
    onlyOfficeEnabled: !!ONLYOFFICE_URL,
  });

  // Handle ESC key to close
  useEscapeKey(onClose, isOpen);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  const handleDownload = useCallback(async () => {
    if (!file) return;
    try {
      const { downloadUrl, fileName } = await fileService.getDownloadInfo(
        file.id,
      );
      triggerDownload(downloadUrl, fileName);
      toast.success("Download started");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start download",
      );
    }
  }, [file]);

  const handleOpenInEditor = useCallback(() => {
    if (!file) return;
    onClose();
    navigate(`/editor?fileId=${file.id}&mode=edit`);
  }, [file, onClose, navigate]);

  // ── Render preview content ──────────────────────────────────
  const renderPreview = () => {
    if (!file) return null;

    if (textContent !== null) {
      return (
        <div className="h-full w-full max-w-5xl mx-auto bg-white dark:bg-gray-950 shadow-2xl rounded-lg overflow-hidden">
          <TextEditor
            value={textContent}
            onChange={() => {}}
            fileName={file.name}
            readOnly={true}
            height="100%"
          />
        </div>
      );
    }

    if (!url && !officeUrl) return null;

    // OnlyOffice for office documents
    if (useOnlyOffice && officeUrl && file) {
      return (
        <div className="h-full w-full max-w-7xl mx-auto bg-white dark:bg-gray-950 shadow-2xl rounded-lg overflow-hidden">
          <OnlyOfficeEditor
            fileId={file.id}
            fileName={file.name}
            fileUrl={officeUrl}
            documentServerUrl={ONLYOFFICE_URL}
            mode="view"
            token={onlyOfficeToken}
          />
        </div>
      );
    }

    switch (fileCategory) {
      case "image":
        return (
          <div className="flex items-center justify-center h-full w-full p-4">
            <img
              src={url!}
              alt={file.name}
              loading="lazy"
              className="max-w-full max-h-full object-contain select-none"
              draggable={false}
            />
          </div>
        );

      case "video":
        return (
          <div className="flex items-center justify-center h-full w-full p-8">
            <video
              src={url!}
              controls
              autoPlay
              className="max-w-full max-h-full rounded-lg shadow-2xl"
              preload="metadata"
              aria-label={`Video player for ${file.name}`}
            >
              Your browser does not support video playback.
            </video>
          </div>
        );

      case "audio":
        return (
          <div className="flex items-center justify-center h-full w-full p-8">
            <div className="w-full max-w-lg bg-white/10 backdrop-blur-md rounded-2xl p-10 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 rounded-full mb-6">
                <Music className="w-10 h-10 text-white" />
              </div>
              <p className="text-white font-medium mb-6 truncate">
                {file.name}
              </p>
              <audio
                src={url!}
                controls
                autoPlay
                className="w-full"
                aria-label={`Audio player for ${file.name}`}
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          </div>
        );

      case "pdf":
        return (
          <div className="h-full w-full max-w-5xl mx-auto bg-white dark:bg-gray-950 shadow-2xl rounded-lg overflow-hidden">
            <Worker
              workerUrl={`https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`}
            >
              <Viewer fileUrl={url!} plugins={[defaultLayoutPluginInstance]} />
            </Worker>
          </div>
        );

      case "document":
      case "spreadsheet":
      case "presentation":
        return (
          <div className="flex flex-col items-center justify-center h-full w-full p-8 text-center">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-10 max-w-md space-y-5">
              {getFileIcon(fileCategory)}
              <p className="text-white font-medium text-lg">{file.name}</p>
              <p className="text-white/60 text-sm">
                {ONLYOFFICE_URL
                  ? "Loading Office document preview..."
                  : "Configure OnlyOffice Document Server to preview Office documents in the browser."}
              </p>
              <div className="flex items-center gap-3 justify-center">
                {canOpenInEditor && (
                  <Button
                    onClick={handleOpenInEditor}
                    variant="secondary"
                    size="sm"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Open in Editor
                  </Button>
                )}
                <Button onClick={handleDownload} variant="secondary" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center h-full w-full p-8 text-center">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-10 max-w-md space-y-5">
              <FileText className="w-12 h-12 text-white/60 mx-auto" />
              <p className="text-white font-medium">No preview available</p>
              <p className="text-white/60 text-sm">
                This file type can't be previewed in the browser.
              </p>
              <Button onClick={handleDownload} variant="secondary" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Download to view
              </Button>
            </div>
          </div>
        );
    }
  };

  if (!isOpen) return null;

  // ── Fullscreen overlay rendered via portal ──────────────────
  return createPortal(
    <div
      className="fixed inset-0 z-100 flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={file?.name || "File preview"}
    >
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between px-4 h-14 bg-black/60 backdrop-blur-sm border-b border-white/10">
        {/* Left: file info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-white/70">{getFileIcon(fileCategory)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-white text-sm font-medium truncate">
              {file?.name}
            </h2>
            {file && (
              <p className="text-white/50 text-xs truncate">
                {formatSize(file.size)}
                {file.mimeType && ` · ${file.mimeType}`}
              </p>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 shrink-0 ml-4">
          <TooltipProvider delayDuration={300}>
            {canOpenInEditor && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenInEditor}
                    className="inline-flex items-center justify-center h-9 px-3 rounded-md text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Edit
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open in editor</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center justify-center h-9 px-3 rounded-md text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Download
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Download file</TooltipContent>
            </Tooltip>

            <div className="w-px h-5 bg-white/20 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onClose}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Close preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close (Esc)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      {/* Content area */}
      <main
        className="flex-1 overflow-hidden relative"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="animate-spin h-10 w-10 text-white/70" />
              <p className="text-sm text-white/50">Loading preview...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 max-w-md space-y-4">
              <p className="text-red-400 font-medium">Failed to load preview</p>
              <p className="text-white/50 text-sm">{error}</p>
              <Button onClick={handleDownload} variant="secondary" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Download file instead
              </Button>
            </div>
          </div>
        )}

        {!isLoading && !error && renderPreview()}
      </main>
    </div>,
    document.body,
  );
};
