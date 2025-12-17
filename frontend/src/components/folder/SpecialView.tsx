import { useEffect, useState, useMemo } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FolderIcon,
  FileIcon,
  Clock,
  Star,
  StarOff,
  Trash2,
  Files,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ItemContextMenu } from "./ItemContextMenu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useFolder } from "@/hooks/folder/useFolder";
import { batchService } from "@/services/batch.service";
import type { ViewType } from "@/contexts/folder/context";
import { formatFileSize } from "@/lib/format";
import { useFileActions } from "@/hooks/folder/useFileActions";

interface SpecialViewProps {
  viewType: Exclude<ViewType, "folder">;
}

type ViewFilter = "all" | "folders" | "files";

export const SpecialView = ({ viewType }: SpecialViewProps) => {
  const {
    folders,
    files,
    isLoading,
    filePaths,
    error,
    selectedItems,
    loadSpecialView,
    toggleSelection,
    clearSelection,
    selectAll: contextSelectAll,
  } = useFolder();

  const { navigateToFolder } = useFileActions();

  // 这些是本地 UI 表现层、使用本地 state
  const [filter, setFilter] = useState<ViewFilter>("all");

  const navigate = useNavigate();

  // 初始化加载
  useEffect(() => {
    loadSpecialView(viewType);
  }, [loadSpecialView, viewType]);

  const filteredFolders = useMemo(() => {
    if (filter === "files") return [];
    return folders;
  }, [folders, filter]);

  const filteredFiles = useMemo(() => {
    if (filter === "folders") return [];
    return files;
  }, [files, filter]);

  const selectAll = () => {
    const allIds = [
      ...filteredFolders.map((f) => f.id),
      ...filteredFiles.map((f) => f.id),
    ];
    contextSelectAll(allIds);
  };

  const getTitle = () => {
    switch (viewType) {
      case "starred":
        return "Starred";
      case "trash":
        return "Trash";
      case "recent":
        return "Recent";
      case "files":
        return "My Files";
      default:
        return "";
    }
  };

  const getIcon = () => {
    switch (viewType) {
      case "starred":
        return <Star className="size-6" />;
      case "trash":
        return <Trash2 className="size-6" />;
      case "recent":
        return <Clock className="size-6" />;
      case "files":
        return <Files className="size-6" />;
      default:
        return null;
    }
  };

  const getEmptyMessage = () => {
    switch (viewType) {
      case "starred":
        return "No starred items";
      case "trash":
        return "Trash is empty";
      case "recent":
        return "No recent items";
      case "files":
        return "No files";
      default:
        return "No items";
    }
  };

  const handleBatchUnstar = async () => {
    try {
      const items = Array.from(selectedItems).map((id) => ({
        id,
        type: (folders.find((f) => f.id === id) ? "folder" : "file") as
          | "file"
          | "folder",
      }));

      const result = await batchService.batchStar(items, false);

      if (result.failureCount > 0) {
        toast.warning(
          `Unstarred ${result.successCount} item(s), ${result.failureCount} failed`
        );
      } else {
        toast.success(`Unstarred ${selectedItems.size} item(s)`);
      }

      await loadSpecialView(viewType);
      clearSelection();
    } catch (error) {
      toast.error(
        "Failed to unstar items: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
    }
  };

  const handleBatchRestore = async () => {
    try {
      const items = Array.from(selectedItems).map((id) => ({
        id,
        type: (folders.find((f) => f.id === id) ? "folder" : "file") as
          | "file"
          | "folder",
      }));

      const result = await batchService.batchRestore(items);

      if (result.failureCount > 0) {
        toast.warning(
          `Restored ${result.successCount} item(s), ${result.failureCount} failed`
        );
      } else {
        toast.success(`Restored ${selectedItems.size} item(s)`);
      }

      loadSpecialView(viewType);
      clearSelection();
    } catch (error) {
      toast.error(
        "Failed to restore items: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
    }
  };

  const handleBatchDelete = async () => {
    try {
      const items = Array.from(selectedItems).map((id) => ({
        id,
        type: (folders.find((f) => f.id === id) ? "folder" : "file") as
          | "file"
          | "folder",
      }));

      const result = await batchService.batchDelete(items);

      if (result.failureCount > 0) {
        toast.warning(
          `Permanently deleted ${result.successCount} item(s), ${result.failureCount} failed`
        );
      } else {
        toast.success(`Permanently deleted ${selectedItems.size} item(s)`);
      }

      loadSpecialView(viewType);
      clearSelection();
    } catch (error) {
      toast.error(
        "Failed to delete items: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-8" />
      </div>
    );
  }

  const isEmpty = filteredFolders.length === 0 && filteredFiles.length === 0;

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6 w-full max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getIcon()}
          <h1 className="text-2xl font-semibold">{getTitle()}</h1>
        </div>
        <div className="flex items-center gap-2">
          {viewType === "recent" && !isEmpty && (
            <Tabs
              value={filter}
              onValueChange={(v) => setFilter(v as ViewFilter)}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="folders">Folders</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </div>

      {/* Batch operations toolbar */}
      {selectedItems.size > 0 &&
        (viewType === "starred" || viewType === "trash") && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">
              {selectedItems.size} item(s) selected
            </span>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            {viewType === "starred" && (
              <Button variant="default" size="sm" onClick={handleBatchUnstar}>
                <StarOff className="size-4 mr-2" />
                Unstar
              </Button>
            )}
            {viewType === "trash" && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleBatchRestore}
                >
                  Restore
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBatchDelete}
                >
                  <Trash2 className="size-4 mr-2" />
                  Delete Permanently
                </Button>
              </>
            )}
          </div>
        )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {getIcon()}
          <h3 className="mt-4 text-lg font-semibold">{getEmptyMessage()}</h3>
          <p className="text-sm text-muted-foreground mt-2">
            {viewType === "starred" && "Star items to find them easily later"}
            {viewType === "trash" &&
              "Items in trash will be automatically deleted after 30 days"}
            {viewType === "recent" &&
              "Your recently accessed items will appear here"}
            {viewType === "files" && "Upload files to get started"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {(viewType === "starred" || viewType === "trash") && (
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        selectedItems.size > 0 &&
                        selectedItems.size ===
                          filteredFolders.length + filteredFiles.length
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          selectAll();
                        } else {
                          clearSelection();
                        }
                      }}
                    />
                  </TableHead>
                )}
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {viewType === "trash" ? "Deleted" : "Modified"}
                </TableHead>
                {viewType !== "trash" && viewType !== "files" && (
                  <TableHead className="hidden xl:table-cell">Type</TableHead>
                )}
                {viewType === "files" && (
                  <>
                    <TableHead className="hidden xl:table-cell">Size</TableHead>
                    <TableHead className="hidden xl:table-cell">
                      Location
                    </TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFolders.map((folder) => (
                <ItemContextMenu
                  key={folder.id}
                  item={folder}
                  type="folder"
                  viewType={
                    viewType === "trash"
                      ? "trash"
                      : viewType === "starred"
                      ? "starred"
                      : "normal"
                  }
                >
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      if (viewType !== "starred" && viewType !== "trash") {
                        navigateToFolder(folder.id);
                      }
                    }}
                  >
                    {(viewType === "starred" || viewType === "trash") && (
                      <TableCell className="w-12">
                        <Checkbox
                          checked={selectedItems.has(folder.id)}
                          onCheckedChange={() => toggleSelection(folder.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                    )}
                    <TableCell
                      className="flex items-center gap-3"
                      onClick={() => {
                        if (viewType === "starred" || viewType === "trash") {
                          navigateToFolder(folder.id);
                        }
                      }}
                    >
                      <FolderIcon className="size-5 text-blue-500" />
                      <span className="font-medium">{folder.name}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {folder.user.name}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {viewType === "trash" && folder.trashedAt
                        ? formatDistanceToNow(new Date(folder.trashedAt), {
                            addSuffix: true,
                          })
                        : formatDistanceToNow(new Date(folder.updatedAt), {
                            addSuffix: true,
                          })}
                    </TableCell>
                    {viewType !== "trash" && viewType !== "files" && (
                      <TableCell className="hidden xl:table-cell text-muted-foreground">
                        Folder
                      </TableCell>
                    )}
                  </TableRow>
                </ItemContextMenu>
              ))}
              {filteredFiles.map((file) => (
                <ItemContextMenu
                  key={file.id}
                  item={file}
                  type="file"
                  viewType={
                    viewType === "trash"
                      ? "trash"
                      : viewType === "starred"
                      ? "starred"
                      : "normal"
                  }
                >
                  <TableRow className="cursor-pointer hover:bg-muted/50">
                    {(viewType === "starred" || viewType === "trash") && (
                      <TableCell className="w-12">
                        <Checkbox
                          checked={selectedItems.has(file.id)}
                          onCheckedChange={() => toggleSelection(file.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                    )}
                    <TableCell className="flex items-center gap-3">
                      <FileIcon className="size-5 text-gray-500" />
                      <span className="font-medium">{file.name}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {file.user.name}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {viewType === "trash" && file.trashedAt
                        ? formatDistanceToNow(new Date(file.trashedAt), {
                            addSuffix: true,
                          })
                        : formatDistanceToNow(new Date(file.updatedAt), {
                            addSuffix: true,
                          })}
                    </TableCell>
                    {viewType !== "trash" && viewType !== "files" && (
                      <TableCell className="hidden xl:table-cell text-muted-foreground">
                        File
                      </TableCell>
                    )}
                    {viewType === "files" && (
                      <>
                        <TableCell className="hidden xl:table-cell text-muted-foreground">
                          {formatFileSize(file.size)}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {file.folder && file.folder !== "root" ? (
                            <div className="flex items-center gap-1 text-sm">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate("/files");
                                }}
                                className="hover:text-primary hover:underline"
                              >
                                My Drive
                              </button>
                              {filePaths.get(file.id)?.map((breadcrumb) => (
                                <div
                                  key={breadcrumb.id}
                                  className="flex items-center gap-1"
                                >
                                  <ChevronRight className="size-3 text-muted-foreground" />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(
                                        `/files?folder=${breadcrumb.id}`
                                      );
                                    }}
                                    className="hover:text-primary hover:underline max-w-[120px] truncate"
                                  >
                                    {breadcrumb.name}
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              My Drive
                            </span>
                          )}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                </ItemContextMenu>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
