import { useEffect, useState } from "react";
import mammoth from "mammoth";
import { Loader2, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isMammothSupported,
  getOfficePreviewErrorMessage,
  isLegacyFormatError,
} from "@/lib/file-preview";

interface OfficeDocumentViewerProps {
  url: string;
  fileName: string;
  mimeType: string;
  onDownload: () => void;
}

export const OfficeDocumentViewer = ({
  url,
  fileName,
  mimeType,
  onDownload,
}: OfficeDocumentViewerProps) => {
  const [html, setHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDocument = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Check if file format is supported by mammoth
        if (
          isMammothSupported(fileName) ||
          mimeType.includes("wordprocessingml")
        ) {
          // Fetch the file as ArrayBuffer
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error("Failed to fetch document");
          }

          const arrayBuffer = await response.arrayBuffer();

          // Convert to HTML using mammoth
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setHtml(result.value);

          // Log any warnings
          if (result.messages.length > 0) {
            console.warn("Mammoth conversion warnings:", result.messages);
          }
        } else {
          // Use pre-defined error messages for unsupported formats
          const errorMsg = getOfficePreviewErrorMessage(fileName);
          setError(errorMsg || "Preview is not available for this file type.");
        }
      } catch (err) {
        console.error("Error loading document:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load document";

        // Check if it's a legacy format error
        if (isLegacyFormatError(errorMessage)) {
          const errorMsg = getOfficePreviewErrorMessage(fileName);
          setError(
            errorMsg ||
              "This appears to be a legacy office file which cannot be previewed. Please download the file to view it."
          );
        } else {
          setError(errorMessage);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadDocument();
  }, [url, fileName, mimeType]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-950">
        <div
          className="flex flex-col items-center gap-2"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-950">
        <div
          className="flex flex-col items-center gap-4 text-center p-8 max-w-md"
          role="alert"
        >
          <AlertCircle className="h-12 w-12 text-amber-500" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Preview Not Available</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={onDownload} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download to View
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-white dark:bg-gray-950">
      <div className="max-w-4xl mx-auto p-8">
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
          style={{
            fontFamily: "system-ui, -apple-system, sans-serif",
            lineHeight: "1.6",
          }}
        />
      </div>
    </div>
  );
};
