import { useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { fileService } from "@/services/file.service";
import { TextEditor } from "@/components/editor/TextEditor";
import { OnlyOfficeEditor } from "@/components/editor/OnlyOfficeEditor";
import { DocumentAgentPanel } from "@/components/agent/DocumentAgentPanel";
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
import { useFileEditor } from "@/hooks/editor/useFileEditor";
import { useKeyboardShortcuts } from "@/hooks/editor/useKeyboardShortcuts";
import { useAgentStore } from "@/stores/useAgentStore";

const ONLYOFFICE_URL = import.meta.env.VITE_ONLYOFFICE_URL || "";

const EditorPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fileId = searchParams.get("fileId");
  const initialMode = searchParams.get("mode") || "edit"; // "edit" | "view"
  const [showDocAgent, setShowDocAgent] = useState(false);
  const newConversation = useAgentStore((s) => s.newConversation);

  const {
    file,
    content,
    setContent,
    onlyOfficeUrl,
    onlyOfficeToken,
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
  } = useFileEditor({
    fileId,
    initialMode: initialMode as "edit" | "view",
    enableAutosave: true,
  });

  // Keyboard shortcut: Ctrl+S to save
  useKeyboardShortcuts([
    {
      key: "s",
      ctrlKey: true,
      handler: handleSave,
    },
  ]);

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

  const handleToggleDocAgent = () => {
    if (!showDocAgent) {
      // Open a fresh conversation when toggling on
      newConversation();
    }
    setShowDocAgent(!showDocAgent);
  };

  /** Called when the Document Agent modifies the file — reload content */
  const handleAgentContentUpdate = useCallback(() => {
    if (reloadContent) {
      reloadContent();
      toast.info("Document updated by AI Agent");
    }
  }, [reloadContent]);

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
            {/* AI Assistant toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showDocAgent ? "default" : "outline"}
                  size="sm"
                  onClick={handleToggleDocAgent}
                >
                  <Bot className="h-4 w-4 mr-1" />
                  AI Assist
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {showDocAgent
                    ? "Close AI editing assistant"
                    : "Open AI editing assistant"}
                </p>
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

      {/* Editor Body + Document Agent Panel */}
      <div className="flex flex-1 overflow-hidden">
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

          {resolvedEditorMode === "onlyoffice" && onlyOfficeUrl && file && (
            <OnlyOfficeEditor
              fileId={file.id}
              fileName={file.name}
              fileUrl={onlyOfficeUrl}
              serverConfig={onlyOfficeServerConfig}
              documentServerUrl={ONLYOFFICE_URL}
              mode={editorMode}
              token={onlyOfficeToken}
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

        {/* Document Agent Sidebar */}
        {showDocAgent && fileId && file && (
          <DocumentAgentPanel
            fileId={fileId}
            fileName={file.name}
            isOpen={showDocAgent}
            onClose={() => setShowDocAgent(false)}
            onContentUpdate={handleAgentContentUpdate}
          />
        )}
      </div>
    </div>
  );
};

export default EditorPage;
