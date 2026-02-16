import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CREATABLE_FILE_TYPES } from "@/lib/file-preview";
import { fileService } from "@/services/file.service";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  FileCode,
  Sheet,
  Presentation,
  Globe,
  Braces,
  Paintbrush,
  Loader2,
} from "lucide-react";

interface CreateFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  FileText: <FileText className="h-4 w-4" />,
  FileCode: <FileCode className="h-4 w-4" />,
  Sheet: <Sheet className="h-4 w-4" />,
  FileSpreadsheet: <Sheet className="h-4 w-4" />,
  Presentation: <Presentation className="h-4 w-4" />,
  Globe: <Globe className="h-4 w-4" />,
  Braces: <Braces className="h-4 w-4" />,
  Paintbrush: <Paintbrush className="h-4 w-4" />,
};

export const CreateFileDialog = ({
  open,
  onOpenChange,
  folderId,
}: CreateFileDialogProps) => {
  const [fileName, setFileName] = useState("");
  const [selectedType, setSelectedType] = useState<string>(
    CREATABLE_FILE_TYPES[0].extension,
  );
  const [isCreating, setIsCreating] = useState(false);

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const selectedFileType = CREATABLE_FILE_TYPES.find(
    (t) => t.extension === selectedType,
  );

  const handleCreate = async () => {
    const name = fileName.trim();
    if (!name) {
      toast.error("Please enter a file name");
      return;
    }

    // Build full file name with extension
    const fullName = name.includes(".") ? name : `${name}.${selectedType}`;

    setIsCreating(true);
    try {
      const file = await fileService.createBlankFile({
        folderId,
        fileName: fullName,
        content: "",
      });

      toast.success(`Created ${fullName}`);

      // Invalidate folder queries to show the new file
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.recent(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.specialViews.files(),
      });

      onOpenChange(false);
      setFileName("");

      // Navigate to editor for the new file
      navigate(`/editor?fileId=${file.id}&mode=edit`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create file";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isCreating) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New File</DialogTitle>
          <DialogDescription>
            Create a new file in the current folder. The file will open in the
            editor after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File type selector */}
          <div className="space-y-2">
            <Label htmlFor="file-type">File Type</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger id="file-type">
                <SelectValue placeholder="Select file type" />
              </SelectTrigger>
              <SelectContent>
                {CREATABLE_FILE_TYPES.map((type) => (
                  <SelectItem key={type.extension} value={type.extension}>
                    <div className="flex items-center gap-2">
                      {ICON_MAP[type.icon] || <FileText className="h-4 w-4" />}
                      <span>{type.label}</span>
                      <span className="text-xs text-muted-foreground">
                        .{type.extension}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* File name input */}
          <div className="space-y-2">
            <Label htmlFor="file-name">File Name</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file-name"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`untitled`}
                className="flex-1"
                autoFocus
                disabled={isCreating}
              />
              <span className="text-sm text-muted-foreground shrink-0">
                .{selectedType}
              </span>
            </div>
          </div>

          {/* Preview */}
          {selectedFileType && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
              {ICON_MAP[selectedFileType.icon] || (
                <FileText className="h-4 w-4" />
              )}
              <span className="text-muted-foreground">
                {fileName.trim() || "untitled"}.{selectedType}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create & Open"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
