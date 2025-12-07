import { useCallback, useState } from "react";

export const useDragDrop = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [, setDragCounter] = useState(0);

  const handleDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragCounter((count) => count + 1);

    if (event.dataTransfer?.items && event.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragCounter((prev) => {
      const newCounter = prev - 1;
      if (newCounter === 0) {
        setIsDragging(false);
      }
      return newCounter;
    });
  }, []);

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent, onDrop: (files: File[]) => void) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      setDragCounter(0);

      if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
        onDrop(Array.from(event.dataTransfer.files));
        event.dataTransfer.clearData();
      }
    },
    []
  );

  const resetDrag = useCallback(() => {
    setIsDragging(false);
    setDragCounter(0);
  }, []);

  return {
    isDragging,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    resetDrag,
  };
};
