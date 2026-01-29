import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSharedWithMe } from "@/hooks/queries/useShareQueries";
import { useShareDialogStore } from "@/stores/useShareDialogStore";
import { useFolderUIStore } from "@/stores/useFolderUIStore";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Folder,
  File,
  ChevronLeft,
  ChevronRight,
  Share2,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ResourceType, SharedWithMeItem } from "@/types/share.types";
import { formatDistanceToNow } from "date-fns";
import { FilePreviewModal } from "@/components/folder/FilePreviewModal";
import type { IFile } from "@/types/file.types";

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const SharedWithMeView = () => {
  const [page, setPage] = useState(1);
  const [resourceTypeFilter, setResourceTypeFilter] = useState<
    ResourceType | "all"
  >("all");
  const [previewFile, setPreviewFile] = useState<IFile | null>(null);
  const limit = 20;
  const navigate = useNavigate();

  const { openShareDialog } = useShareDialogStore();
  const setCurrentFolderId = useFolderUIStore(
    (state) => state.setCurrentFolderId,
  );

  const { data, isLoading, error } = useSharedWithMe({
    page,
    limit,
    resourceType: resourceTypeFilter === "all" ? undefined : resourceTypeFilter,
  });

  // Convert shared resource to IFile format for preview
  // Note: We only need the minimal fields required by FilePreviewModal
  const convertToIFile = (item: SharedWithMeItem): IFile | null => {
    if (item.resourceType !== "File") return null;
    const resource = item.resource;
    return {
      id: resource._id,
      name: resource.name,
      originalName: resource.name,
      mimeType: resource.mimeType || "application/octet-stream",
      size: resource.size || 0,
      extension: resource.extension || "",
      type: "file",
      folder: "root", // Not used for preview, placeholder value
      user: {
        id: item.sharedBy._id,
        name: item.sharedBy.name,
        email: item.sharedBy.email,
        avatar: { thumbnail: item.sharedBy.avatar || "" },
      },
      linkAccessStatus: "none",
      isStarred: resource.isStarred || false,
      isTrashed: resource.isTrashed || false,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    };
  };

  const handleItemClick = (item: SharedWithMeItem) => {
    if (item.resourceType === "Folder") {
      // Navigate to the shared folder
      setCurrentFolderId(item.resource._id);
      navigate(`/files?folder=${item.resource._id}`);
    } else {
      // For files, open file preview modal
      const file = convertToIFile(item);
      if (file) {
        setPreviewFile(file);
      }
    }
  };

  const handleManageAccess = (item: SharedWithMeItem) => {
    openShareDialog(item.resource._id, item.resourceType, item.resource.name);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Failed to load shared items</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Shared with me</h1>
        <Select
          value={resourceTypeFilter}
          onValueChange={(v) => {
            setResourceTypeFilter(v as ResourceType | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="File">Files only</SelectItem>
            <SelectItem value="Folder">Folders only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Name</TableHead>
                <TableHead>Shared by</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last modified</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow
                  key={`${item.resourceType}-${item.resource._id}`}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleItemClick(item)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {item.resourceType === "Folder" ? (
                        <Folder
                          className="h-8 w-8"
                          style={{ color: item.resource.color || "#6366f1" }}
                        />
                      ) : (
                        <File className="h-8 w-8 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{item.resource.name}</p>
                        {item.resourceType === "File" && item.resource.size && (
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(item.resource.size)}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={item.sharedBy.avatar}
                          alt={item.sharedBy.name}
                        />
                        <AvatarFallback className="text-xs">
                          {getInitials(item.sharedBy.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{item.sharedBy.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={item.role === "editor" ? "default" : "secondary"}
                    >
                      {item.role.charAt(0).toUpperCase() + item.role.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(item.resource.updatedAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleManageAccess(item);
                          }}
                        >
                          <Share2 className="mr-2 h-4 w-4" />
                          Manage access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1} to{" "}
                {Math.min(page * limit, data.pagination.total)} of{" "}
                {data.pagination.total} items
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Share2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Nothing shared with you yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            When someone shares a file or folder with you, it will appear here.
          </p>
        </div>
      )}

      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        file={previewFile}
      />
    </div>
  );
};
