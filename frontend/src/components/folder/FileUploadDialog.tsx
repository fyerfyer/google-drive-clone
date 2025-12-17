import { useState, useCallback, useMemo, useRef } from "react";
import { useFolder } from "@/hooks/folder/useFolder";
import { useFileUpload as useFileUploadPresigned } from "@/hooks/useFileUpload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X, FileIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
}

export const FileUploadDialog = ({
  open,
  onOpenChange,
  folderId,
}: FileUploadDialogProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const { refreshContent } = useFolder();
  const { uploads, uploadFiles, clearCompleted } = useFileUploadPresigned();

  const isUploading = useMemo(() => {
    return Array.from(uploads.values()).some(
      (upload) => upload.status === "uploading" || upload.status === "pending"
    );
  }, [uploads]);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files || []);
      setFiles((prev) => [...prev, ...selectedFiles]);
    },
    []
  );

  const handleRemoveFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    },
    []
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current === 0) {
        setIsDragging(false);
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      setFiles((prev) => [...prev, ...droppedFiles]);
    }
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error("Please select files to upload");
      return;
    }

    try {
      await uploadFiles(files, folderId);
      toast.success("Files uploaded successfully");
      await refreshContent();
      clearCompleted();
      onOpenChange(false);
      setFiles([]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload files"
      );
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileProgress = (fileName: string) => {
    for (const upload of uploads.values()) {
      if (upload.fileName === fileName) {
        return upload;
      }
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription>
            Select files to upload to the current folder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Input */}
          <div className="flex items-center justify-center w-full">
            <label
              htmlFor="file-upload"
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted/50"
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload
                  className={`size-10 mb-2 ${
                    isDragging ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <p className="mb-2 text-sm text-muted-foreground">
                  <span className="font-semibold">Click to upload</span> or drag
                  and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  Any file type supported
                </p>
              </div>
              <input
                id="file-upload"
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                disabled={isUploading}
              />
            </label>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {files.map((file, index) => {
                const progress = getFileProgress(file.name);
                return (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <FileIcon className="size-8 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                      {progress && (
                        <div className="mt-2">
                          <Progress value={progress.progress} className="h-1" />
                          <div className="flex items-center gap-2 mt-1">
                            {progress.status === "success" && (
                              <CheckCircle2 className="size-3 text-green-500" />
                            )}
                            {progress.status === "error" && (
                              <AlertCircle className="size-3 text-destructive" />
                            )}
                            <span className="text-xs text-muted-foreground">
                              {progress.status === "pending" && "Pending..."}
                              {progress.status === "uploading" &&
                                `Uploading... ${progress.progress}%`}
                              {progress.status === "processing" &&
                                "Processing..."}
                              {progress.status === "success" && "Uploaded"}
                              {progress.status === "error" &&
                                (progress.error || "Upload failed")}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    {!isUploading && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveFile(index)}
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={isUploading || files.length === 0}
          >
            {isUploading ? "Uploading..." : `Upload ${files.length} file(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
