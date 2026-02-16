import { useEffect, useRef } from "react";
import type {
  OnlyOfficeConfig,
  DocsAPIDocEditor,
  DocumentType,
  EditorMode,
} from "@/types/onlyoffice.types";

interface OnlyOfficeEditorProps {
  fileId: string;
  fileName: string;
  fileUrl: string;
  documentServerUrl: string;
  mode?: EditorMode;
  token?: string;
}

export const OnlyOfficeEditor = ({
  fileId,
  fileName,
  fileUrl,
  documentServerUrl,
  mode = "view",
  token,
}: OnlyOfficeEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const docEditorRef = useRef<DocsAPIDocEditor | null>(null);

  useEffect(() => {
    if (!editorRef.current || !documentServerUrl) return;

    // Determine document type based on file extension
    const getDocumentType = (filename: string): DocumentType => {
      const ext = filename.split(".").pop()?.toLowerCase() || "";
      if (["doc", "docx", "odt", "rtf", "txt"].includes(ext)) return "word";
      if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "cell";
      if (["ppt", "pptx", "odp"].includes(ext)) return "slide";
      if (["pdf"].includes(ext)) return "word"; // PDF as word type for viewing
      return "word";
    };

    const getFileType = (filename: string): string => {
      return filename.split(".").pop()?.toLowerCase() || "docx";
    };

    const config: OnlyOfficeConfig = {
      document: {
        fileType: getFileType(fileName),
        key: `${fileId}_${Date.now()}`, // Unique key for document identification
        title: fileName,
        url: fileUrl,
        permissions: {
          comment: mode === "edit",
          copy: true,
          download: true,
          edit: mode === "edit",
          fillForms: mode === "edit",
          modifyContentControl: mode === "edit",
          modifyFilter: mode === "edit",
          print: true,
          review: mode === "edit",
        },
      },
      documentType: getDocumentType(fileName),
      editorConfig: {
        mode: mode, // "edit" or "view"
        lang: "en",
        customization: {
          autosave: true,
          forcesave: false,
          compactHeader: false,
          compactToolbar: false,
          toolbarNoTabs: false,
          hideRightMenu: false,
        },
      },
      height: "100%",
      width: "100%",
      type: mode === "edit" ? "desktop" : "embedded",
    };

    // Add token only if provided (for JWT authentication)
    if (token) {
      config.token = token;
    }

    // Load OnlyOffice API script
    const scriptId = "onlyoffice-api-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const initEditor = () => {
      if (editorRef.current && window.DocsAPI) {
        // Destroy previous instance if exists
        if (docEditorRef.current) {
          try {
            docEditorRef.current.destroyEditor();
          } catch (e) {
            console.warn("Error destroying editor:", e);
          }
        }

        // Create new editor instance
        docEditorRef.current = new window.DocsAPI.DocEditor(
          editorRef.current.id,
          config,
        );
      }
    };

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = `${documentServerUrl}/web-apps/apps/api/documents/api.js`;
      script.async = true;
      script.onload = initEditor;
      document.body.appendChild(script);
    } else if (window.DocsAPI) {
      initEditor();
    } else {
      script.onload = initEditor;
    }

    // Cleanup
    return () => {
      if (docEditorRef.current) {
        try {
          docEditorRef.current.destroyEditor();
        } catch (e) {
          console.warn("Error destroying editor:", e);
        }
        docEditorRef.current = null;
      }
    };
  }, [fileId, fileName, fileUrl, documentServerUrl, mode, token]);

  return (
    <div className="w-full h-full">
      <div
        id={`onlyoffice-editor-${fileId}`}
        ref={editorRef}
        className="w-full h-full"
      />
    </div>
  );
};
