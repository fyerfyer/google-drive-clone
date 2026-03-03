import { useState, useEffect, useCallback } from "react";
import {
  IconFolder,
  IconFileText,
  IconChevronRight,
  IconArrowLeft,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { folderService } from "@/services/folder.service";
import { useAgentStore, type ResourceAttachment } from "@/stores/useAgentStore";
import type { Folder } from "@/types/folder.types";
import type { IFile } from "@/types/file.types";
import { cn } from "@/lib/utils";

interface ResourceAttachmentPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial mode when opening the picker */
  mode?: "file" | "folder";
}

interface BreadcrumbEntry {
  id: string;
  name: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function ResourceAttachmentPicker({
  open,
  onOpenChange,
  mode = "file",
}: ResourceAttachmentPickerProps) {
  const addResourceAttachment = useAgentStore((s) => s.addResourceAttachment);
  const existingAttachments = useAgentStore((s) => s.resourceAttachments);

  const [currentFolderId, setCurrentFolderId] = useState("root");
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([
    { id: "root", name: "My Drive" },
  ]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<IFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pickerMode, setPickerMode] = useState<"file" | "folder">(mode);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setCurrentFolderId("root");
      setBreadcrumbs([{ id: "root", name: "My Drive" }]);
      setPickerMode(mode);
    }
  }, [open, mode]);

  // Fetch folder content when currentFolderId changes
  const loadFolder = useCallback(async (folderId: string) => {
    setIsLoading(true);
    try {
      const content = await folderService.getFolderContent(folderId);
      setFolders(content.folders);
      setFiles(content.files);
    } catch {
      setFolders([]);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadFolder(currentFolderId);
    }
  }, [currentFolderId, open, loadFolder]);

  const navigateToFolder = (folder: Folder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const navigateToBreadcrumb = (index: number) => {
    const entry = breadcrumbs[index];
    setCurrentFolderId(entry.id);
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const goBack = () => {
    if (breadcrumbs.length > 1) {
      const newBreadcrumbs = breadcrumbs.slice(0, -1);
      setBreadcrumbs(newBreadcrumbs);
      setCurrentFolderId(newBreadcrumbs[newBreadcrumbs.length - 1].id);
    }
  };

  const isAlreadyAttached = (uri: string) =>
    existingAttachments.some((a) => a.uri === uri);

  const handleAttachFile = (file: IFile) => {
    const attachment: ResourceAttachment = {
      uri: `drive://files/${file.id}`,
      name: file.name,
      type: "file",
      id: file.id,
    };
    addResourceAttachment(attachment);
    onOpenChange(false);
  };

  const handleAttachFolder = () => {
    const currentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
    const attachment: ResourceAttachment = {
      uri: `drive://folders/${currentFolderId}`,
      name: currentBreadcrumb.name,
      type: "folder",
      id: currentFolderId,
    };
    addResourceAttachment(attachment);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {pickerMode === "file" ? "Attach a File" : "Attach a Folder"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {pickerMode === "file"
              ? "Browse your drive and select a file to attach as context."
              : "Browse to a folder and attach its structure as context."}
          </DialogDescription>
        </DialogHeader>

        {/* Mode Toggle */}
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          <button
            onClick={() => setPickerMode("file")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              pickerMode === "file"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <IconFileText className="size-3.5" />
            File
          </button>
          <button
            onClick={() => setPickerMode("folder")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              pickerMode === "folder"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <IconFolder className="size-3.5" />
            Folder
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto">
          {breadcrumbs.length > 1 && (
            <button
              onClick={goBack}
              className="shrink-0 rounded p-0.5 hover:bg-muted transition-colors"
            >
              <IconArrowLeft className="size-3.5" />
            </button>
          )}
          {breadcrumbs.map((entry, idx) => (
            <div key={entry.id} className="flex items-center gap-1 shrink-0">
              {idx > 0 && (
                <IconChevronRight className="size-3 text-muted-foreground/50" />
              )}
              <button
                onClick={() => navigateToBreadcrumb(idx)}
                className={cn(
                  "rounded px-1.5 py-0.5 hover:bg-muted transition-colors truncate max-w-[120px]",
                  idx === breadcrumbs.length - 1
                    ? "text-foreground font-medium"
                    : "",
                )}
              >
                {entry.name}
              </button>
            </div>
          ))}
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto border rounded-lg min-h-[200px] max-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <IconLoader2 className="size-5 animate-spin" />
            </div>
          ) : folders.length === 0 && files.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
              This folder is empty
            </div>
          ) : (
            <div className="divide-y">
              {/* Folders first */}
              {folders.map((folder) => {
                const folderUri = `drive://folders/${folder.id}`;
                const attached = isAlreadyAttached(folderUri);
                return (
                  <button
                    key={folder.id}
                    onClick={() => navigateToFolder(folder)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors text-sm",
                      attached && "opacity-60",
                    )}
                  >
                    <IconFolder className="size-4 shrink-0 text-blue-500" />
                    <span className="flex-1 truncate">{folder.name}</span>
                    {attached && (
                      <IconCheck className="size-3.5 shrink-0 text-green-500" />
                    )}
                    <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                  </button>
                );
              })}

              {/* Files */}
              {pickerMode === "file" &&
                files.map((file) => {
                  const fileUri = `drive://files/${file.id}`;
                  const attached = isAlreadyAttached(fileUri);
                  return (
                    <button
                      key={file.id}
                      onClick={() => !attached && handleAttachFile(file)}
                      disabled={attached}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors text-sm",
                        attached
                          ? "opacity-60 cursor-not-allowed"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <IconFileText className="size-4 shrink-0 text-emerald-500" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatBytes(file.size)}
                      </span>
                      {attached && (
                        <IconCheck className="size-3.5 shrink-0 text-green-500" />
                      )}
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Attach Folder button (only in folder mode) */}
        {pickerMode === "folder" && (
          <button
            onClick={handleAttachFolder}
            disabled={isAlreadyAttached(`drive://folders/${currentFolderId}`)}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <IconFolder className="size-4" />
            Attach "{breadcrumbs[breadcrumbs.length - 1].name}"
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
