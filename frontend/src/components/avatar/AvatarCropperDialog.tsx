import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { getCroppedImage } from "@/lib/image";

interface AvatarCropperDialogProps {
  open: boolean;
  imageSrc: string | null;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

export const AvatarCropperDialog = ({
  open,
  imageSrc,
  onOpenChange,
  onCancel,
  onConfirm,
}: AvatarCropperDialogProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setIsProcessing(false);
    }
  }, [open, imageSrc]);

  const handleCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleZoomChange = (value: number[]) => {
    setZoom(value[0]);
  };

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) {
      return;
    }

    try {
      setIsProcessing(true);
      const croppedImage = await getCroppedImage(imageSrc, croppedAreaPixels);
      onConfirm(croppedImage);
    } catch (error) {
      console.error("Failed to crop avatar", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const dialogOpen = useMemo(() => open && Boolean(imageSrc), [open, imageSrc]);

  if (!imageSrc) {
    return null;
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit avatar</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative h-72 w-full overflow-hidden rounded-xl bg-muted">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Zoom</span>
              <span>{zoom.toFixed(2)}x</span>
            </div>
            <Slider
              min={1}
              max={3}
              step={0.1}
              value={[zoom]}
              onValueChange={handleZoomChange}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isProcessing}>
            {isProcessing ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
