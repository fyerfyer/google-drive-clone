import {
  Download,
  Edit,
  Trash2,
  Share2,
  Eye,
  Star,
  StarOff,
  FolderInput,
} from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { FolderItem, ItemActions } from "@/hooks/folder/useFileActions";

interface FileActionsProps {
  item: FolderItem;
  onAction: (action: ItemActions, item: FolderItem) => void;
  mode: "context" | "dropdown";
}

export const FileActions = ({ item, onAction, mode }: FileActionsProps) => {
  const Item = mode === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator =
    mode === "context" ? ContextMenuSeparator : DropdownMenuSeparator;

  const isFile = item.type === "file";

  return (
    <>
      {isFile && (
        <>
          <Item onClick={() => onAction("preview", item)}>
            <Eye className="mr-2 h-4 w-4" /> Preview
          </Item>
          <Item onClick={() => onAction("download", item)}>
            <Download className="mr-2 h-4 w-4" /> Download
          </Item>
          <Separator />
        </>
      )}
      <Item onClick={() => onAction("rename", item)}>
        <Edit className="mr-2 h-4 w-4" /> Rename
      </Item>
      <Item onClick={() => onAction("move", item)}>
        <FolderInput className="mr-2 h-4 w-4" /> Move
      </Item>
      <Separator />
      {item.isStarred ? (
        <Item onClick={() => onAction("unstar", item)}>
          <StarOff className="mr-2 h-4 w-4" /> Unstar
        </Item>
      ) : (
        <Item onClick={() => onAction("star", item)}>
          <Star className="mr-2 h-4 w-4" /> Star
        </Item>
      )}
      <Item onClick={() => onAction("share", item)}>
        <Share2 className="mr-2 h-4 w-4" /> Share
      </Item>
      <Separator />
      <Item onClick={() => onAction("delete", item)}>
        <Trash2 className="mr-2 h-4 w-4" /> Delete
      </Item>
    </>
  );
};
