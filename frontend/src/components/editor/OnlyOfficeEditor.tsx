import { useEffect, useRef } from "react";
import type {
  OnlyOfficeConfig,
  DocsAPIDocEditor,
} from "@/types/onlyoffice.types";

interface OnlyOfficeEditorProps {
  fileId: string;
  fileName: string;
  /** The full OnlyOffice config object from backend, or null to build a minimal one */
  serverConfig?: OnlyOfficeConfig | null;
  /** Fallback: direct file URL for OnlyOffice to load */
  fileUrl?: string;
  documentServerUrl: string;
  mode?: "edit" | "view";
  token?: string;
}

export const OnlyOfficeEditor = ({
  fileId,
  fileName,
  serverConfig,
  fileUrl,
  documentServerUrl,
  mode = "view",
  token,
}: OnlyOfficeEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const docEditorRef = useRef<DocsAPIDocEditor | null>(null);

  useEffect(() => {
    if (!editorRef.current || !documentServerUrl) return;

    // Use the server config if available, otherwise build a minimal one
    let config: OnlyOfficeConfig;

    if (serverConfig) {
      // Use the backend-provided complete config (includes callbackUrl, etc.)
      config = {
        ...serverConfig,
        height: "100%",
        width: "100%",
        type: mode === "edit" ? "desktop" : "embedded",
      };

      // Override mode based on prop
      if (config.editorConfig) {
        config.editorConfig.mode = mode;
      }

      // Override permissions based on mode
      if (config.document?.permissions) {
        config.document.permissions.edit = mode === "edit";
        config.document.permissions.comment = mode === "edit";
        config.document.permissions.review = mode === "edit";
        config.document.permissions.fillForms = mode === "edit";
        config.document.permissions.modifyContentControl = mode === "edit";
        config.document.permissions.modifyFilter = mode === "edit";
      }
    } else {
      // Fallback: build minimal config (no save callback)
      const getDocumentType = (filename: string): "word" | "cell" | "slide" => {
        const ext = filename.split(".").pop()?.toLowerCase() || "";
        if (["doc", "docx", "odt", "rtf", "txt"].includes(ext)) return "word";
        if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "cell";
        if (["ppt", "pptx", "odp"].includes(ext)) return "slide";
        return "word";
      };

      const getFileType = (filename: string): string => {
        return filename.split(".").pop()?.toLowerCase() || "docx";
      };

      config = {
        document: {
          fileType: getFileType(fileName),
          key: `${fileId}_${Date.now()}`,
          title: fileName,
          url: fileUrl || "",
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
          mode: mode,
          lang: "en",
          customization: {
            autosave: true,
            forcesave: true,
          },
        },
        height: "100%",
        width: "100%",
        type: mode === "edit" ? "desktop" : "embedded",
      };
    }

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
  }, [fileId, fileName, fileUrl, documentServerUrl, mode, token, serverConfig]);

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
