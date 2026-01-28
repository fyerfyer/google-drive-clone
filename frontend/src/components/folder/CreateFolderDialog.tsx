import { useState } from "react";
import { useCreateFolder } from "@/hooks/mutations/useFolderMutations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { toast } from "sonner";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string | null;
}

export const CreateFolderDialog = ({
  open,
  onOpenChange,
  parentId,
}: CreateFolderDialogProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createFolderMutation = useCreateFolder();

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Folder name is required");
      return;
    }

    try {
      await createFolderMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        parentId,
      });
      onOpenChange(false);
      setName("");
      setDescription("");
    } catch {
      // Error is handled by the mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
          <DialogDescription>
            Create a new folder to organize your files.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4 py-4">
          <Field>
            <FieldLabel htmlFor="folder-name">Folder Name</FieldLabel>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Folder"
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="folder-description">
              Description (Optional)
            </FieldLabel>
            <Textarea
              id="folder-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={3}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createFolderMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createFolderMutation.isPending}
          >
            {createFolderMutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
