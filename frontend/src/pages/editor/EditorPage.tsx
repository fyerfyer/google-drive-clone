import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { fileService } from "@/services/file.service";
import type { IFile } from "@/types/file.types";
import { TextEditor } from "@/components/editor/TextEditor";
import { OnlyOfficeEditor } from "@/components/editor/OnlyOfficeEditor";
import { getEditorMode } from "@/lib/file-preview";
import { triggerDownload } from "@/lib/download";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ArrowLeft,
  Save,
  Download,
  FileText,
  Eye,
  Pencil,
  Bot,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ONLYOFFICE_URL = import.meta.env.VITE_ONLYOFFICE_URL || "";
const AUTOSAVE_DELAY = 3000; // 3 seconds

const EditorPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fileId = searchParams.get("fileId");
  const initialMode = searchParams.get("mode") || "edit"; // "edit" | "view"

  const [file, setFile] = useState<IFile | null>(null);
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [onlyofficeToken, setOnlyofficeToken] = useState<string | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"edit" | "view">(
    initialMode as "edit" | "view",
  );

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedChanges = content !== originalContent;

  // Load file content
  useEffect(() => {
    if (!fileId) {
      setError("No file ID provided");
      setIsLoading(false);
      return;
    }

    const loadFile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // First, try to get file content for file metadata
        let fileInfo: IFile | null = null;
        let textContent: string | null = null;

        try {
          const result = await fileService.getFileContent(fileId);
          fileInfo = result.file;
          textContent = result.content;
        } catch {
          // getFileContent failed - get file info via download info
          const downloadInfo = await fileService.getDownloadInfo(fileId);
          fileInfo = {
            id: fileId,
            name: downloadInfo.fileName,
            originalName: downloadInfo.fileName,
            mimeType: "",
            size: 0,
            folder: "",
            extension: downloadInfo.fileName.split(".").pop() || "",
            type: "file",
            isStarred: false,
            isTrashed: false,
            createdAt: "",
            updatedAt: "",
            user: { id: "", name: "", email: "", avatar: { thumbnail: "" } },
            linkAccessStatus: "none",
          };
        }

        setFile(fileInfo);

        // Determine editor mode based on file name
        const mode = fileInfo?.name ? getEditorMode(fileInfo.name) : "none";

        if (mode === "onlyoffice") {
          // For OnlyOffice files, get a Docker-reachable office-content URL
          try {
            const officeData = await fileService.getOfficeContentUrl(fileId);
            setPreviewUrl(officeData.url);
            setOnlyofficeToken(officeData.token);
          } catch {
            setError("Failed to get preview URL for this document");
          }
        } else if (mode === "text" && textContent !== null) {
          // For text files, use the content we already loaded
          setContent(textContent);
          setOriginalContent(textContent);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load file");
      } finally {
        setIsLoading(false);
      }
    };

    loadFile();
  }, [fileId]);

  const handleSave = useCallback(async () => {
    if (!file?.name || !fileId || isSaving) return;
    if (getEditorMode(file.name) !== "text") return;

    setIsSaving(true);
    try {
      const updatedFile = await fileService.updateFileContent(fileId, content);
      setFile(updatedFile);
      setOriginalContent(content);
      toast.success("File saved");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save file";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [file, fileId, content, isSaving]);

  // Autosave for text files
  useEffect(() => {
    if (!file?.name || !hasUnsavedChanges) return;
    if (getEditorMode(file.name) !== "text") return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, AUTOSAVE_DELAY);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [content, hasUnsavedChanges, file, handleSave]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Keyboard shortcut: Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  const handleDownload = async () => {
    if (!fileId) return;
    try {
      const { downloadUrl, fileName } =
        await fileService.getDownloadInfo(fileId);
      triggerDownload(downloadUrl, fileName);
      toast.success("Download started");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to download file",
      );
    }
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      const confirm = window.confirm(
        "You have unsaved changes. Are you sure you want to leave?",
      );
      if (!confirm) return;
    }
    navigate(-1);
  };

  const resolvedEditorMode = file?.name ? getEditorMode(file.name) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-8" />
          <p className="text-sm text-muted-foreground">Loading editor...</p>
        </div>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-destructive">{error || "File not found"}</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Editor Header */}
      <header className="shrink-0 flex items-center justify-between px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div className="flex flex-col">
            <h1 className="text-sm font-medium truncate max-w-[400px]">
              {file.name}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {hasUnsavedChanges && (
                <span className="text-amber-500">● Unsaved changes</span>
              )}
              {isSaving && <span className="text-blue-500">Saving...</span>}
              {!hasUnsavedChanges && !isSaving && (
                <span className="text-emerald-500">Saved</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            {/* AI Assistant placeholder */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" disabled>
                  <Bot className="h-4 w-4 mr-1" />
                  AI Assist
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>AI editing assistant (coming soon)</p>
              </TooltipContent>
            </Tooltip>

            {/* View/Edit toggle */}
            {resolvedEditorMode === "text" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={editorMode === "view" ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setEditorMode(editorMode === "edit" ? "view" : "edit")
                    }
                  >
                    {editorMode === "edit" ? (
                      <>
                        <Eye className="h-4 w-4 mr-1" />
                        Read Only
                      </>
                    ) : (
                      <>
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Switch to {editorMode === "edit" ? "read-only" : "edit"}{" "}
                    mode
                  </p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Save button */}
            {resolvedEditorMode === "text" && editorMode === "edit" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving || !hasUnsavedChanges}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Save (Ctrl+S)</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Download button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Download file</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      {/* Editor Body */}
      <main className="flex-1 overflow-hidden">
        {resolvedEditorMode === "text" && (
          <TextEditor
            value={content}
            onChange={setContent}
            fileName={file.name}
            readOnly={editorMode === "view"}
            height="100%"
          />
        )}

        {resolvedEditorMode === "onlyoffice" && previewUrl && file && (
          <OnlyOfficeEditor
            fileId={file.id}
            fileName={file.name}
            fileUrl={previewUrl}
            documentServerUrl={ONLYOFFICE_URL}
            mode={editorMode}
            token={onlyofficeToken}
          />
        )}

        {resolvedEditorMode === "none" && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <p className="text-muted-foreground mb-4">
              This file type cannot be edited in the browser.
            </p>
            <Button onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download to view
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default EditorPage;
