import { useNavigate } from "react-router-dom";
import { useFolder } from "@/hooks/folder/useFolder";
import { Card, CardContent } from "@/components/ui/card";
import { FolderIcon, FileIcon, MoreVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Folder } from "@/types/folder.types";
import type { IFile } from "@/types/file.types";
import { ItemContextMenu } from "./ItemContextMenu";

export const FolderGridView = () => {
  const { folders, files, toggleSelection, selectedItems } = useFolder();
  const navigate = useNavigate();

  const handleFolderClick = (folderId: string) => {
    navigate(`/files?folder=${folderId}`);
  };

  const handleFileClick = (fileId: string) => {
    // TODO: Implement file preview/download
    console.log("File clicked:", fileId);
  };

  const renderFolderCard = (folder: Folder) => {
    const isSelected = selectedItems.has(folder.id);

    return (
      <ItemContextMenu key={folder.id} item={folder} type="folder">
        <Card
          className={`cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] ${
            isSelected ? "ring-2 ring-primary" : ""
          }`}
          onClick={() => handleFolderClick(folder.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FolderIcon
                  className="size-10 shrink-0"
                  style={{ color: folder.color || "#6366f1" }}
                  fill="currentColor"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-2">
                    {folder.name}
                  </p>
                  {folder.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                      {folder.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(folder.updatedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
              <button
                className="p-1 hover:bg-muted rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelection(folder.id);
                }}
              >
                <MoreVertical className="size-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      </ItemContextMenu>
    );
  };

  const renderFileCard = (file: IFile) => {
    const isSelected = selectedItems.has(file.id);

    return (
      <ItemContextMenu key={file.id} item={file} type="file">
        <Card
          className={`cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] ${
            isSelected ? "ring-2 ring-primary" : ""
          }`}
          onClick={() => handleFileClick(file.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FileIcon className="size-10 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-2">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(file.updatedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
              <button
                className="p-1 hover:bg-muted rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelection(file.id);
                }}
              >
                <MoreVertical className="size-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      </ItemContextMenu>
    );
  };

  return (
    <div className="space-y-6">
      {folders.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
            Folders
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {folders.map(renderFolderCard)}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
            Files
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {files.map(renderFileCard)}
          </div>
        </div>
      )}
    </div>
  );
};
