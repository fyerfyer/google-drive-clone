import { useNavigate } from "react-router-dom";
import { useFolder } from "@/hooks/folder/useFolder";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { FolderIcon, FileIcon, MoreVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Folder } from "@/types/folder.types";
import type { IFile } from "@/types/file.types";
import { ItemContextMenu } from "./ItemContextMenu";

export const FolderListView = () => {
  const { folders, files, toggleSelection, selectedItems } = useFolder();
  const navigate = useNavigate();

  const handleFolderClick = (folderId: string) => {
    navigate(`/files?folder=${folderId}`);
  };

  const handleFileClick = (fileId: string) => {
    // TODO: Implement file preview/download
    console.log("File clicked:", fileId);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const renderFolderRow = (folder: Folder) => {
    const isSelected = selectedItems.has(folder.id);

    return (
      <ItemContextMenu key={folder.id} item={folder} type="folder">
        <TableRow
          className="cursor-pointer"
          onClick={() => handleFolderClick(folder.id)}
        >
          <TableCell className="w-12">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleSelection(folder.id)}
              onClick={(e) => e.stopPropagation()}
            />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <FolderIcon
                className="size-5 shrink-0"
                style={{ color: folder.color || "#6366f1" }}
                fill="currentColor"
              />
              <span className="font-medium">{folder.name}</span>
            </div>
          </TableCell>
          <TableCell>{folder.user.name}</TableCell>
          <TableCell>
            {formatDistanceToNow(new Date(folder.updatedAt), {
              addSuffix: true,
            })}
          </TableCell>
          <TableCell>—</TableCell>
          <TableCell className="w-12">
            <button
              className="p-1 hover:bg-muted rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleSelection(folder.id);
              }}
            >
              <MoreVertical className="size-4" />
            </button>
          </TableCell>
        </TableRow>
      </ItemContextMenu>
    );
  };

  const renderFileRow = (file: IFile) => {
    const isSelected = selectedItems.has(file.id);

    return (
      <ItemContextMenu key={file.id} item={file} type="file">
        <TableRow
          className="cursor-pointer"
          onClick={() => handleFileClick(file.id)}
        >
          <TableCell className="w-12">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleSelection(file.id)}
              onClick={(e) => e.stopPropagation()}
            />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <FileIcon className="size-5 shrink-0 text-muted-foreground" />
              <span className="font-medium">{file.name}</span>
            </div>
          </TableCell>
          <TableCell>{file.user.name}</TableCell>
          <TableCell>
            {formatDistanceToNow(new Date(file.updatedAt), {
              addSuffix: true,
            })}
          </TableCell>
          <TableCell>{formatFileSize(file.size)}</TableCell>
          <TableCell className="w-12">
            <button
              className="p-1 hover:bg-muted rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleSelection(file.id);
              }}
            >
              <MoreVertical className="size-4" />
            </button>
          </TableCell>
        </TableRow>
      </ItemContextMenu>
    );
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Last Modified</TableHead>
            <TableHead>Size</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {folders.map(renderFolderRow)}
          {files.map(renderFileRow)}
        </TableBody>
      </Table>
    </div>
  );
};
