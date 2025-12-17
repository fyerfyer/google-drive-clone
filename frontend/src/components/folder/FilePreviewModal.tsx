/* eslint-disable react-hooks/set-state-in-effect */
import { fileService } from "@/services/file.service";
import type { IFile } from "@/types/file.types";
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DocViewer, { DocViewerRenderers } from "@cyntler/react-doc-viewer";
import "@cyntler/react-doc-viewer/dist/index.css";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerDownload } from "@/lib/download";
import { toast } from "sonner";
import { OfficeDocumentViewer } from "./OfficeDocumentViewer";
import { getFileCategory, createDocViewerDocument } from "@/lib/file-preview";

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: IFile | null;
}

export const FilePreviewModal = ({
  isOpen,
  onClose,
  file,
}: FilePreviewModalProps) => {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && file) {
      setIsLoading(true);
      setError(null);

      fileService
        .getPreviewUrl(file.id)
        .then((previewUrl) => setUrl(previewUrl))
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load file");
        })
        .finally(() => setIsLoading(false));
    } else {
      setUrl(null);
      setError(null);
    }
  }, [isOpen, file]);

  const fileCategory = useMemo(() => {
    return file ? getFileCategory(file.mimeType, file.name) : "other";
  }, [file]);

  const docs = useMemo(() => {
    if (!url || !file) return [];
    return [createDocViewerDocument(url, file.name)];
  }, [url, file]);

  const handleDownload = async () => {
    if (!file) return;

    try {
      const { downloadUrl, fileName } = await fileService.getDownloadInfo(
        file.id
      );
      triggerDownload(downloadUrl, fileName);
      toast.success("Download started");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message);
    }
  };

  const renderPreview = () => {
    if (!url || !file) return null;

    switch (fileCategory) {
      case "image":
        return (
          <div className="flex items-center justify-center h-full p-4 bg-gray-50 dark:bg-gray-900">
            <img
              src={url}
              alt={file.name}
              loading="lazy"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        );

      case "video":
        return (
          <div className="flex items-center justify-center h-full p-4 bg-black">
            <video
              src={url}
              controls
              className="max-w-full max-h-full"
              preload="metadata"
              aria-label={`Video player for ${file.name}`}
            >
              Your browser does not support video playback.
            </video>
          </div>
        );

      case "audio":
        return (
          <div className="flex items-center justify-center h-full p-8 bg-gray-50 dark:bg-gray-900">
            <div className="w-full max-w-2xl">
              <audio
                src={url}
                controls
                className="w-full"
                aria-label={`Audio player for ${file.name}`}
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          </div>
        );

      case "text":
        return (
          <div className="h-full overflow-auto p-6 bg-white dark:bg-gray-950">
            <iframe
              src={url}
              className="w-full h-full border-0"
              title={file.name}
            />
          </div>
        );

      case "pdf":
        return (
          <div className="h-full bg-gray-50 dark:bg-gray-900">
            <DocViewer
              documents={docs}
              pluginRenderers={DocViewerRenderers}
              prefetchMethod="GET"
              config={{
                header: {
                  disableHeader: true,
                  disableFileName: true,
                  retainURLParams: true,
                },
                pdfZoom: {
                  defaultZoom: 1.0,
                  zoomJump: 0.2,
                },
                pdfVerticalScrollByDefault: true,
              }}
              style={{ height: "100%" }}
              className="h-full"
            />
          </div>
        );

      case "document":
        return (
          <OfficeDocumentViewer
            url={url}
            fileName={file.name}
            mimeType={file.mimeType}
            onDownload={handleDownload}
          />
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <p className="text-muted-foreground mb-4">
              Preview not available for this file type
            </p>
            <Button onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download to view
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-7xl w-[90vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-4 pr-8">
            <DialogTitle className="truncate flex-1 text-base">
              {file?.name}
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="shrink-0"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-background/80 backdrop-blur-sm">
              <div
                className="flex flex-col items-center gap-2"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Loading preview...
                </p>
              </div>
            </div>
          )}

          {error && (
            <div
              className="flex flex-col items-center justify-center h-full text-center p-8"
              role="alert"
            >
              <p className="text-destructive mb-4">
                Failed to load preview: {error}
              </p>
              <Button onClick={handleDownload} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Download file instead
              </Button>
            </div>
          )}

          {!isLoading && !error && renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
};
