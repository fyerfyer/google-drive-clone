import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { ViewMode, ViewType } from "@/types/common.types";

/**
 * UI-only store for folder browsing state
 * Data fetching is now handled by React Query (useFolderQueries)
 */
export interface FolderUIState {
  // Current view context
  viewType: ViewType;
  currentFolderId: string;

  // UI state
  selectedItems: Set<string>;
  viewMode: ViewMode;
}

export interface FolderUIActions {
  // View state
  setViewType: (viewType: ViewType) => void;
  setCurrentFolderId: (folderId: string) => void;

  // Selection management
  toggleSelection: (itemId: string) => void;
  selectAll: (itemIds: string[]) => void;
  clearSelection: () => void;

  // View mode
  setViewMode: (mode: ViewMode) => void;
}

export type FolderUIStore = FolderUIState & FolderUIActions;

export const useFolderUIStore = create<FolderUIStore>()(
  devtools(
    (set) => ({
      // Initial state
      viewType: "folder",
      currentFolderId: "root",
      selectedItems: new Set<string>(),
      viewMode: "grid",

      // View state actions
      setViewType: (viewType: ViewType) => {
        set(
          { viewType, selectedItems: new Set() },
          false,
          "folder-ui/set-view-type",
        );
      },

      setCurrentFolderId: (folderId: string) => {
        set(
          {
            currentFolderId: folderId,
            viewType: "folder",
            selectedItems: new Set(),
          },
          false,
          "folder-ui/set-current-folder",
        );
      },

      // Selection actions
      toggleSelection: (itemId: string) => {
        set(
          (state) => {
            const newSelected = new Set(state.selectedItems);
            if (newSelected.has(itemId)) {
              newSelected.delete(itemId);
            } else {
              newSelected.add(itemId);
            }
            return { selectedItems: newSelected };
          },
          false,
          "folder-ui/toggle-selection",
        );
      },

      selectAll: (itemIds: string[]) => {
        set({ selectedItems: new Set(itemIds) }, false, "folder-ui/select-all");
      },

      clearSelection: () => {
        set({ selectedItems: new Set() }, false, "folder-ui/clear-selection");
      },

      // View mode
      setViewMode: (mode: ViewMode) => {
        set({ viewMode: mode }, false, "folder-ui/set-view-mode");
      },
    }),
    { name: "FolderUIStore" },
  ),
);
