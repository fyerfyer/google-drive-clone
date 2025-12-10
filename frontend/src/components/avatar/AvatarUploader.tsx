import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarCropperDialog } from "@/components/avatar/AvatarCropperDialog";
import { readFileAsDataUrl, dataUrlToFile } from "@/lib/image";
import { useAvatarUpload } from "@/hooks/useAvatarUpload";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import type { User } from "@/types/user.types";

interface AvatarUploaderProps {
  disabled?: boolean;
  fallbackText: string;
  existingImageUrl?: string | null;
  /**
   * Whether to automatically update user profile after upload
   * If false, onUploadSuccess will receive the avatar key
   */
  autoUpdate?: boolean;
  /**
   * Called when upload succeeds
   * - If autoUpdate=true: receives updated user object
   * - If autoUpdate=false: receives avatar key string
   */
  onUploadSuccess?: (result: User | string | undefined) => void;
  onUploadError?: (error: string) => void;
}

export const AvatarUploader = ({
  disabled,
  fallbackText,
  existingImageUrl,
  autoUpdate = true,
  onUploadSuccess,
  onUploadError,
}: AvatarUploaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { uploadState, uploadAvatar, reset } = useAvatarUpload({ autoUpdate });

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
      onUploadError?.("Failed to read image file");
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

  const handleDialogConfirm = async (croppedDataUrl: string) => {
    setPendingImage(null);
    setIsDialogOpen(false);
    resetInput();

    try {
      // Convert cropped data URL back to File
      const file = await dataUrlToFile(croppedDataUrl, "avatar.png");

      // Upload to server and get result (validation happens here)
      const result = await uploadAvatar(file);

      // Only set preview after successful upload/validation
      setPreviewImage(croppedDataUrl);

      // Pass result to callback
      // If autoUpdate=true, result is undefined (user updated in hook)
      // If autoUpdate=false, result is the avatar key
      onUploadSuccess?.(result);
    } catch (error) {
      console.error("Avatar upload failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      onUploadError?.(errorMessage);
      // Don't set preview on error - avatar should not be displayed
    }
  };

  const handleRemove = () => {
    setPreviewImage(null);
    reset();
    resetInput();
  };

  const displayImage =
    uploadState.success && existingImageUrl
      ? existingImageUrl
      : previewImage ?? existingImageUrl;

  const fallback = fallbackText?.trim().slice(0, 2).toUpperCase() || "US";
  const isUploading = uploadState.isUploading;
  const isDisabled = disabled || isUploading;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar className="h-20 w-20 rounded-lg">
            <AvatarImage src={displayImage ?? undefined} alt="Avatar preview" />
            <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
          </Avatar>
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isDisabled}
            >
              {displayImage ? "Change avatar" : "Upload avatar"}
            </Button>
            {displayImage && !uploadState.isUploading && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleRemove}
                disabled={isDisabled}
              >
                Remove
              </Button>
            )}
          </div>
          {isUploading && (
            <div className="space-y-1">
              <Progress value={uploadState.progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Uploading... {uploadState.progress}%
              </p>
            </div>
          )}
          {!isUploading && (
            <p className="text-xs text-muted-foreground">
              PNG, JPG, or WEBP. Max 5MB.
            </p>
          )}
          {uploadState.error && (
            <p className="text-xs text-destructive">{uploadState.error}</p>
          )}
        </div>
      </div>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
        disabled={isDisabled}
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
