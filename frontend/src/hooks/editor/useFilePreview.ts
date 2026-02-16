import { useState, useEffect, useMemo, useCallback } from "react";
import { fileService } from "@/services/file.service";
import type { IFile } from "@/types/file.types";
import {
  getEditorMode,
  isOnlyOfficeCompatible,
  getFileCategory,
  type FileCategory,
} from "@/lib/file-preview";
import { useOnlyOffice } from "./useOnlyOffice";

export interface UseFilePreviewOptions {
  file: IFile | null;
  isOpen: boolean;
  onlyOfficeEnabled: boolean;
}

export interface UseFilePreviewReturn {
  // Preview URLs
  url: string | null;
  officeUrl: string | null;
  onlyOfficeToken: string | undefined;
  textContent: string | null;

  // States
  isLoading: boolean;
  error: string | null;

  // File info
  fileCategory: FileCategory;
  editorMode: "text" | "onlyoffice" | "none";
  canOpenInEditor: boolean;
  useOnlyOffice: boolean;

  // Actions
  refetch: () => void;
}

export const useFilePreview = ({
  file,
  isOpen,
  onlyOfficeEnabled,
}: UseFilePreviewOptions): UseFilePreviewReturn => {
  const [url, setUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editorMode = file?.name ? getEditorMode(file.name) : "none";
  const useOO = file && isOnlyOfficeCompatible(file.name) && onlyOfficeEnabled;

  // Load OnlyOffice config if needed
  const { config: onlyOfficeConfig } = useOnlyOffice(
    useOO && isOpen ? file.id : null,
  );

  // Load file data
  useEffect(() => {
    if (!isOpen || !file) {
      setUrl(null);
      setTextContent(null);
      setError(null);
      return;
    }

    const loadPreview = async () => {
      setIsLoading(true);
      setError(null);
      setTextContent(null);
      setUrl(null);

      try {
        if (editorMode === "text") {
          // Load text content
          const result = await fileService.getFileContent(file.id);
          setTextContent(result.content);
        } else if (useOO) {
          // For Office documents, just load preview URL
          // OnlyOffice URL will be loaded by useOnlyOffice hook
          const previewUrl = await fileService.getPreviewUrl(file.id);
          setUrl(previewUrl);
        } else {
          // Load regular preview URL
          const previewUrl = await fileService.getPreviewUrl(file.id);
          setUrl(previewUrl);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load file preview",
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadPreview();
  }, [isOpen, file, editorMode, useOO]);

  const fileCategory = useMemo(
    () => (file ? getFileCategory(file.mimeType, file.name) : "other"),
    [file],
  );

  const canOpenInEditor = file?.name
    ? getEditorMode(file.name) !== "none"
    : false;

  const refetch = useCallback(() => {
    if (isOpen && file) {
      setUrl(null);
      setTextContent(null);
      setError(null);
    }
  }, [isOpen, file]);

  return {
    url,
    officeUrl: onlyOfficeConfig?.url || null,
    onlyOfficeToken: onlyOfficeConfig?.token,
    textContent,
    isLoading,
    error,
    fileCategory,
    editorMode,
    canOpenInEditor,
    useOnlyOffice: !!useOO,
    refetch,
  };
};
