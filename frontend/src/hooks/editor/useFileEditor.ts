import { useState, useEffect, useCallback, useRef } from "react";
import { fileService } from "@/services/file.service";
import type { IFile } from "@/types/file.types";
import type { OnlyOfficeConfig } from "@/types/onlyoffice.types";
import { getEditorMode } from "@/lib/file-preview";
import { toast } from "sonner";
import { useOnlyOffice } from "./useOnlyOffice";

const AUTOSAVE_DELAY = 3000; // 3 seconds

export interface UseFileEditorOptions {
  fileId: string | null;
  initialMode?: "edit" | "view";
  enableAutosave?: boolean;
}

export interface UseFileEditorReturn {
  // File state
  file: IFile | null;
  content: string;
  setContent: (content: string) => void;

  // OnlyOffice state
  onlyOfficeUrl: string | null;
  onlyOfficeToken: string | undefined;
  /** Full OnlyOffice config from backend (includes callbackUrl for saving) */
  onlyOfficeServerConfig: OnlyOfficeConfig | null;

  // Loading/error states
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // Editor mode
  editorMode: "edit" | "view";
  setEditorMode: (mode: "edit" | "view") => void;
  resolvedEditorMode: "text" | "onlyoffice" | "none" | null;

  // Actions
  handleSave: () => Promise<void>;
  hasUnsavedChanges: boolean;
  /** Reload file content from server (e.g. after AI Agent edits) */
  reloadContent: () => Promise<void>;
}

export const useFileEditor = ({
  fileId,
  initialMode = "edit",
  enableAutosave = true,
}: UseFileEditorOptions): UseFileEditorReturn => {
  const [file, setFile] = useState<IFile | null>(null);
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"edit" | "view">(initialMode);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedChanges = content !== originalContent;

  // Load OnlyOffice config for office files
  const { config: onlyOfficeConfig, serverConfig: onlyOfficeServerConfig } =
    useOnlyOffice(
      file?.name && getEditorMode(file.name) === "onlyoffice" ? fileId : null,
    );

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

        // For text files, set the content
        if (
          fileInfo?.name &&
          getEditorMode(fileInfo.name) === "text" &&
          textContent !== null
        ) {
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

  // Save handler
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
    if (!file?.name || !hasUnsavedChanges || !enableAutosave) return;
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
  }, [content, hasUnsavedChanges, file, handleSave, enableAutosave]);

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

  const reloadContent = useCallback(async () => {
    if (!fileId) return;
    try {
      const result = await fileService.getFileContent(fileId);
      if (result.content !== null) {
        setContent(result.content);
        setOriginalContent(result.content);
      }
    } catch {
      // Silently fail — the user can refresh manually
    }
  }, [fileId]);

  const resolvedEditorMode = file?.name ? getEditorMode(file.name) : null;

  return {
    file,
    content,
    setContent,
    onlyOfficeUrl: onlyOfficeConfig?.url || null,
    onlyOfficeToken: onlyOfficeConfig?.token,
    onlyOfficeServerConfig,
    isLoading,
    isSaving,
    error,
    editorMode,
    setEditorMode,
    resolvedEditorMode,
    handleSave,
    hasUnsavedChanges,
    reloadContent,
  };
};
