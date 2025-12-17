import { useState, useCallback, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import type { IFile } from "@/types/file.types";
import type { Folder } from "@/types/folder.types";

export type DraggableItem = (IFile | Folder) & { type: "file" | "folder" };

interface UseDragDropOptions {
  onMove?: (itemId: string, targetFolderId: string) => void;
  onFileUpload?: (files: File[], folderId: string) => void;
  currentFolderId?: string;
}

interface FileDragState {
  isDragging: boolean;
  dragCounter: number;
  files: File[];
}

/**
 * A comprehensive drag-drop hook using dnd-kit
 * Supports:
 * 1. Drag files/folders to move them between folders
 * 2. Drag files from desktop to upload
 */
export const useDragDrop = ({
  onMove,
  onFileUpload,
  currentFolderId,
}: UseDragDropOptions = {}) => {
  // For dnd-kit item dragging
  const [activeItem, setActiveItem] = useState<DraggableItem | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // For file upload drag state
  const [fileDragState, setFileDragState] = useState<FileDragState>({
    isDragging: false,
    dragCounter: 0,
    files: [],
  });

  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    }),
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // Long press on touch
        tolerance: 5,
      },
    })
  );

  // Handle drag start for items
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveItem(active.data.current as DraggableItem);
  }, []);

  // Handle drag over for items
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    setOverId(over?.id as string | null);
  }, []);

  // Handle drag end for items
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const item = active.data.current as DraggableItem;
        const targetFolder = over.data.current as Folder;

        // Only allow dropping into folders
        if (targetFolder && targetFolder.type === "folder") {
          onMove?.(item.id, targetFolder.id);
        }
      }

      setActiveItem(null);
      setOverId(null);
    },
    [onMove]
  );

  // Handle file drag from desktop - Enter
  const handleFileDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setFileDragState((prev) => ({
      ...prev,
      dragCounter: prev.dragCounter + 1,
      isDragging: true,
    }));
  }, []);

  // Handle file drag from desktop - Leave
  const handleFileDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setFileDragState((prev) => {
      const newCounter = prev.dragCounter - 1;
      return {
        ...prev,
        dragCounter: newCounter,
        isDragging: newCounter > 0,
      };
    });
  }, []);

  // Handle file drag from desktop - Over
  const handleFileDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  // Handle file drop from desktop
  const handleFileDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = Array.from(e.dataTransfer?.files || []);

      if (files.length > 0 && currentFolderId) {
        onFileUpload?.(files, currentFolderId);
      }

      setFileDragState({
        isDragging: false,
        dragCounter: 0,
        files: [],
      });
    },
    [currentFolderId, onFileUpload]
  );

  // Setup event listeners for file drag-drop from desktop
  useEffect(() => {
    const dropZone = dropZoneRef.current;
    if (!dropZone) return;

    dropZone.addEventListener("dragenter", handleFileDragEnter as any);
    dropZone.addEventListener("dragleave", handleFileDragLeave as any);
    dropZone.addEventListener("dragover", handleFileDragOver as any);
    dropZone.addEventListener("drop", handleFileDrop as any);

    return () => {
      dropZone.removeEventListener("dragenter", handleFileDragEnter as any);
      dropZone.removeEventListener("dragleave", handleFileDragLeave as any);
      dropZone.removeEventListener("dragover", handleFileDragOver as any);
      dropZone.removeEventListener("drop", handleFileDrop as any);
    };
  }, [
    handleFileDragEnter,
    handleFileDragLeave,
    handleFileDragOver,
    handleFileDrop,
  ]);

  return {
    // DndContext props
    DndContext,
    DragOverlay,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    collisionDetection: closestCenter,

    // Active drag state
    activeItem,
    overId,

    // File upload drag state
    isFileDragging: fileDragState.isDragging,
    dropZoneRef,
  };
};
