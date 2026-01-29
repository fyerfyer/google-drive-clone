import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { shareService } from "@/services/share.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Folder as FolderIcon,
  File as FileIcon,
  Download,
  AlertCircle,
  Eye,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import GoogleDriveIcon from "@/assets/GoogleDriveIcon.svg";
import { triggerDownload } from "@/lib/download";
import { toast } from "sonner";
import DocViewer, { DocViewerRenderers } from "@cyntler/react-doc-viewer";
import "@cyntler/react-doc-viewer/dist/index.css";
import { getFileCategory, createDocViewerDocument } from "@/lib/file-preview";

interface SharedResource {
  resourceId: string;
  resourceType: "File" | "Folder";
  name: string;
  role: string;
  allowDownload: boolean;
}

interface FolderItem {
  id: string;
  name: string;
  color?: string;
  type: string;
  updatedAt: string;
}

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  type: string;
  updatedAt: string;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

type ViewMode = "landing" | "folder" | "file-preview";

const SharedAccessPage = () => {
  const { type, token } = useParams<{ type: string; token: string }>();
  const navigate = useNavigate();

  // Resource info
  const [resource, setResource] = useState<SharedResource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("landing");

  // Folder browsing state
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);

  // File preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{
    name: string;
    mimeType: string;
    size: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch resource info on mount
  useEffect(() => {
    const fetchResource = async () => {
      if (!type || !token) {
        setError("Invalid share link");
        setIsLoading(false);
        return;
      }

      const resourceType = type.charAt(0).toUpperCase() + type.slice(1);
      if (resourceType !== "File" && resourceType !== "Folder") {
        setError("Invalid resource type");
        setIsLoading(false);
        return;
      }

      try {
        const data = await shareService.getSharedResourceByToken(
          token,
          resourceType,
        );
        setResource(data as SharedResource);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to access shared resource",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchResource();
  }, [type, token]);

  // Load folder content
  const loadFolderContent = async (folderId?: string) => {
    if (!token) return;

    setFolderLoading(true);
    try {
      const content = await shareService.getSharedFolderContent(
        token,
        folderId,
      );
      setFolders(content.folders);
      setFiles(content.files);

      // Load breadcrumbs if not at root shared folder
      if (folderId && folderId !== resource?.resourceId) {
        const path = await shareService.getSharedFolderPath(token, folderId);
        setBreadcrumbs(path);
      } else {
        setBreadcrumbs([
          { id: resource?.resourceId || "", name: resource?.name || "" },
        ]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load folder");
    } finally {
      setFolderLoading(false);
    }
  };

  // Load file preview
  const loadFilePreview = async () => {
    if (!token) return;

    setPreviewLoading(true);
    try {
      const result = await shareService.getSharedFilePreviewUrl(token);
      setPreviewUrl(result.url);
      setPreviewFile({
        name: result.fileName,
        mimeType: result.mimeType,
        size: result.size,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load preview",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle opening folder
  const handleOpenFolder = async () => {
    setViewMode("folder");
    await loadFolderContent();
  };

  // Handle opening file preview
  const handlePreviewFile = async () => {
    setViewMode("file-preview");
    await loadFilePreview();
  };

  // Handle folder navigation
  const handleFolderClick = async (folderId: string) => {
    await loadFolderContent(folderId);
  };

  // Handle breadcrumb navigation
  const handleBreadcrumbClick = async (folderId: string) => {
    if (folderId === resource?.resourceId) {
      await loadFolderContent();
    } else {
      await loadFolderContent(folderId);
    }
  };

  // Handle file download
  const handleDownload = async () => {
    if (!token || !resource) return;

    try {
      const result = await shareService.getSharedFileDownloadInfo(token);
      triggerDownload(result.downloadUrl, result.fileName);
      toast.success("Download started");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download");
    }
  };

  // Handle back to landing
  const handleBackToLanding = () => {
    setViewMode("landing");
    setPreviewUrl(null);
    setPreviewFile(null);
    setFolders([]);
    setFiles([]);
    setBreadcrumbs([]);
  };

  // File preview document for DocViewer
  const docs = useMemo(() => {
    if (!previewUrl || !previewFile) return [];
    return [createDocViewerDocument(previewUrl, previewFile.name)];
  }, [previewUrl, previewFile]);

  const fileCategory = useMemo(() => {
    return previewFile
      ? getFileCategory(previewFile.mimeType, previewFile.name)
      : "other";
  }, [previewFile]);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="size-8" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img
                src={GoogleDriveIcon}
                alt="Google Drive"
                className="w-12 h-12"
              />
            </div>
            <CardTitle>Unable to Access</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-6 text-center">
              <Button variant="outline" onClick={() => navigate("/")}>
                Go to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!resource) return null;

  // Render file preview
  const renderFilePreview = () => {
    if (previewLoading) {
      return (
        <div className="flex items-center justify-center h-96">
          <Spinner className="size-8" />
        </div>
      );
    }

    if (!previewUrl || !previewFile) return null;

    switch (fileCategory) {
      case "image":
        return (
          <div className="flex items-center justify-center h-[70vh] bg-gray-50 dark:bg-gray-900 rounded-lg">
            <img
              src={previewUrl}
              alt={previewFile.name}
              loading="lazy"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        );

      case "video":
        return (
          <div className="flex items-center justify-center h-[70vh] bg-black rounded-lg">
            <video
              src={previewUrl}
              controls
              className="max-w-full max-h-full"
              preload="metadata"
            >
              Your browser does not support video playback.
            </video>
          </div>
        );

      case "audio":
        return (
          <div className="flex items-center justify-center h-32 bg-gray-50 dark:bg-gray-900 rounded-lg p-8">
            <audio src={previewUrl} controls className="w-full max-w-2xl">
              Your browser does not support audio playback.
            </audio>
          </div>
        );

      case "pdf":
        return (
          <div className="h-[70vh] bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
            <DocViewer
              documents={docs}
              pluginRenderers={DocViewerRenderers}
              prefetchMethod="GET"
              config={{
                header: { disableHeader: true },
                pdfZoom: { defaultZoom: 1.0, zoomJump: 0.2 },
              }}
            />
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center h-64 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <FileIcon className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">{previewFile.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatFileSize(previewFile.size)} • {previewFile.mimeType}
            </p>
            {resource.allowDownload && (
              <Button onClick={handleDownload} className="mt-4">
                <Download className="mr-2 h-4 w-4" />
                Download File
              </Button>
            )}
          </div>
        );
    }
  };

  // Folder browser view
  if (viewMode === "folder") {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" onClick={handleBackToLanding}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={GoogleDriveIcon} alt="Google Drive" className="w-8 h-8" />
            <h1 className="text-xl font-semibold">Shared Folder</h1>
          </div>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 mb-4 flex-wrap">
            {breadcrumbs.map((item, index) => (
              <div key={item.id} className="flex items-center">
                {index > 0 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleBreadcrumbClick(item.id)}
                  className="px-2"
                >
                  {item.name}
                </Button>
              </div>
            ))}
          </div>

          {/* Content */}
          {folderLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="size-8" />
            </div>
          ) : folders.length === 0 && files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderIcon className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">This folder is empty</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Folders */}
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  onClick={() => handleFolderClick(folder.id)}
                  className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 cursor-pointer"
                >
                  <FolderIcon
                    className="h-10 w-10"
                    style={{ color: folder.color || "#6366f1" }}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{folder.name}</p>
                    <p className="text-sm text-muted-foreground">Folder</p>
                  </div>
                </div>
              ))}

              {/* Files */}
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50"
                >
                  <FileIcon className="h-10 w-10 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Login prompt */}
          <div className="mt-8 text-center text-sm text-muted-foreground border-t pt-4">
            <p>Want to save this to your Drive?</p>
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={() => navigate("/login")}
            >
              Sign in to Google Drive Clone
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // File preview view
  if (viewMode === "file-preview") {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={handleBackToLanding}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <img
                src={GoogleDriveIcon}
                alt="Google Drive"
                className="w-8 h-8"
              />
              <div>
                <h1 className="text-xl font-semibold">
                  {previewFile?.name || resource.name}
                </h1>
                {previewFile && (
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(previewFile.size)}
                  </p>
                )}
              </div>
            </div>
            {resource.allowDownload && (
              <Button onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            )}
          </div>

          {/* Preview content */}
          {renderFilePreview()}

          {/* Login prompt */}
          <div className="mt-8 text-center text-sm text-muted-foreground border-t pt-4">
            <p>Want to save this to your Drive?</p>
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={() => navigate("/login")}
            >
              Sign in to Google Drive Clone
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Landing page (default)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img
              src={GoogleDriveIcon}
              alt="Google Drive"
              className="w-12 h-12"
            />
          </div>
          <CardTitle className="text-xl">
            Shared {resource.resourceType}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Resource info */}
          <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/50">
            {resource.resourceType === "Folder" ? (
              <FolderIcon className="h-12 w-12 text-blue-500" />
            ) : (
              <FileIcon className="h-12 w-12 text-gray-500" />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate">{resource.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">
                  {resource.role.charAt(0).toUpperCase() +
                    resource.role.slice(1)}
                </Badge>
                {resource.resourceType === "File" && resource.allowDownload && (
                  <Badge variant="outline">Download allowed</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {resource.resourceType === "Folder" ? (
              <Button onClick={handleOpenFolder} className="w-full">
                <FolderIcon className="mr-2 h-4 w-4" />
                Open Folder
              </Button>
            ) : (
              <>
                <Button onClick={handlePreviewFile} className="w-full">
                  <Eye className="mr-2 h-4 w-4" />
                  Preview File
                </Button>
                {resource.allowDownload && (
                  <Button
                    variant="outline"
                    onClick={handleDownload}
                    className="w-full"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download File
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Login prompt */}
          <div className="text-center text-sm text-muted-foreground border-t pt-4">
            <p>Want to save this to your Drive?</p>
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={() => navigate("/login")}
            >
              Sign in to Google Drive Clone
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SharedAccessPage;
