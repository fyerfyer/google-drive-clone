import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarCropperDialog } from "@/components/avatar/AvatarCropperDialog";
import { readFileAsDataUrl } from "@/lib/image";

interface AvatarUploaderProps {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  fallbackText: string;
  existingImageUrl?: string | null;
}

export const AvatarUploader = ({
  value,
  onChange,
  disabled,
  fallbackText,
  existingImageUrl,
}: AvatarUploaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPendingImage(dataUrl);
      setIsDialogOpen(true);
    } catch (error) {
      console.error("Unable to read avatar file", error);
    }
  };

  const resetInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDialogCancel = () => {
    setPendingImage(null);
    setIsDialogOpen(false);
    resetInput();
  };

  const handleDialogConfirm = (dataUrl: string) => {
    onChange(dataUrl);
    setPendingImage(null);
    setIsDialogOpen(false);
    resetInput();
  };

  const handleRemove = () => {
    onChange(null);
    resetInput();
  };

  const previewSrc = value ?? existingImageUrl ?? undefined;
  const fallback = fallbackText.trim().slice(0, 2).toUpperCase() || "US";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20 rounded-lg">
          <AvatarImage src={previewSrc} alt="Avatar preview" />
          <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              {previewSrc ? "Change avatar" : "Upload avatar"}
            </Button>
            {previewSrc && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleRemove}
                disabled={disabled}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, JPG, or WEBP. Crop before saving.
          </p>
        </div>
      </div>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <AvatarCropperDialog
        open={isDialogOpen}
        imageSrc={pendingImage}
        onOpenChange={setIsDialogOpen}
        onCancel={handleDialogCancel}
        onConfirm={handleDialogConfirm}
      />
    </div>
  );
};
