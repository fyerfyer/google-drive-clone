import type { FolderItem, ItemActions } from "@/hooks/folder/useFileActions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@radix-ui/react-checkbox";
import { FileIcon, FolderIcon, MoreVertical, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatFileSize } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileActions } from "@/components/folder/FileActions";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
              {item.isShared && item.sharedUsers && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="flex items-center gap-1 text-[10px] text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded-full cursor-help hover:bg-blue-500/20 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction("share", item);
                        }}
                      >
                        <Users className="size-3" />
                        <span>Shared</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <div className="flex flex-col gap-1 max-w-[200px]">
                        <p className="font-semibold text-xs border-b pb-1">
                          Shared with:
                        </p>
                        {item.sharedUsers.slice(0, 5).map((u) => (
                          <div key={u.id} className="text-xs truncate">
                            {u.name || u.email}
                          </div>
                        ))}
                        {item.sharedUsers.length > 5 && (
                          <div className="text-xs text-muted-foreground mt-1 text-center">
                            + {item.sharedUsers.length - 5} more
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
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

          <TableCell className="w-12" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 hover:bg-muted rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <MoreVertical className="size-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
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
