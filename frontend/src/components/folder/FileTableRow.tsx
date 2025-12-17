import type { FolderItem, ItemActions } from "@/hooks/folder/useFileActions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@radix-ui/react-checkbox";
import { FileIcon, FolderIcon, MoreVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatFileSize } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileActions } from "@/components/folder/FileActions";
import { useDraggable, useDroppable } from "@dnd-kit/core";

interface FileTableRowProps {
  item: FolderItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onNavigate: (id: string) => void;
  onAction: (action: ItemActions, item: FolderItem) => void;
}

export const FileTableRow = ({
  item,
  isSelected,
  onSelect,
  onNavigate,
  onAction,
}: FileTableRowProps) => {
  const handleRowClick = () => {
    if (item.type === "folder") {
      onNavigate(item.id);
    } else {
      onSelect(item.id);
    }
  };

  const isDraggableItem = true;
  const isDroppableItem = item.type === "folder"; // 只有 Folder 可以作为放置目标

  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    isDragging,
  } = useDraggable({
    id: item.id,
    data: item,
    disabled: !isDraggableItem,
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: item.id,
    data: item,
    disabled: !isDroppableItem,
  });

  // Combine refs for folders (both draggable and droppable)
  const setRefs = (node: HTMLTableRowElement | null) => {
    if (isDroppableItem) {
      setDroppableRef(node);
    }
    setDraggableRef(node);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow
          ref={setRefs}
          {...(isDraggableItem ? attributes : {})}
          {...(isDraggableItem ? listeners : {})}
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${
            isDragging ? "opacity-50" : ""
          } ${isOver ? "bg-green-50 dark:bg-green-950" : ""}`}
          onClick={handleRowClick}
          data-state={isSelected ? "selected" : undefined}
        >
          {/* Checkbox Column */}
          <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onSelect(item.id)}
            />
          </TableCell>

          {/* Name & Icon Column */}
          <TableCell>
            <div className="flex items-center gap-2">
              {item.type === "folder" ? (
                <FolderIcon
                  className="size-5 shrink-0"
                  style={{ color: "#6366f1" }}
                  fill="currentColor"
                />
              ) : (
                <FileIcon className="size-5 shrink-0 text-muted-foreground" />
              )}
              <span className="font-medium text-sm truncate">{item.name}</span>
            </div>
          </TableCell>

          {/* User Column */}
          <TableCell className="text-muted-foreground text-sm">
            {item.user.name}
          </TableCell>

          {/* Date Column */}
          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
            {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
          </TableCell>

          {/* Size Column */}
          <TableCell className="text-muted-foreground text-sm font-mono">
            {item.type === "folder" ? "-" : formatFileSize(item.size)}
          </TableCell>

          <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 hover:bg-muted rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <MoreVertical className="size-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <FileActions item={item} onAction={onAction} mode="dropdown" />
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      </ContextMenuTrigger>

      {/* Context Menu Content */}
      <ContextMenuContent>
        <FileActions item={item} onAction={onAction} mode="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
};
