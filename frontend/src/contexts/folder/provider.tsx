import {
  FolderContext,
  type FolderContextType,
  type FolderState,
} from "@/contexts/folder/context";
import { folderService } from "@/services/folder.service";
import type { FolderContent } from "@/types/folder.types";
import { useCallback, useMemo, useReducer, type ReactNode } from "react";
import { toast } from "sonner";

type FolderAction =
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS"; payload: FolderContent }
  | { type: "LOAD_FAILURE"; payload: string }
  | { type: "TOGGLE_SELECTION"; payload: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "SET_VIEW_MODE"; payload: "grid" | "list" };

const initState: FolderState = {
  currentFolder: null,
  folders: [],
  files: [],
  breadcrumbs: [],
  isLoading: false,
  error: null,
  selectedItems: new Set(),
  viewMode: "grid",
};

interface FolderProviderProps {
  children: ReactNode;
}

const folderReducer = (
  state: FolderState,
  action: FolderAction
): FolderState => {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, isLoading: true, error: null };

    case "LOAD_SUCCESS":
      return {
        ...state,
        currentFolder: action.payload.currentFolder,
        folders: action.payload.folders,
        files: action.payload.files,
        breadcrumbs: action.payload.breadcrumbs,
        isLoading: false,
        error: null,
      };

    case "LOAD_FAILURE":
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };

    case "TOGGLE_SELECTION": {
      const newSelected: Set<string> = new Set(state.selectedItems);
      if (newSelected.has(action.payload)) {
        newSelected.delete(action.payload);
      } else {
        newSelected.add(action.payload);
      }
      return { ...state, selectedItems: newSelected };
    }

    case "CLEAR_SELECTION":
      return { ...state, selectedItems: new Set() };

    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.payload };

    default:
      return state;
  }
};

export const FolderProvider = ({ children }: FolderProviderProps) => {
  const [state, dispatch] = useReducer(folderReducer, initState);

  const loadFolderContent = useCallback(async (folderId: string) => {
    try {
      dispatch({ type: "LOAD_START" });
      const content = await folderService.getFolderContent(folderId);
      dispatch({ type: "LOAD_SUCCESS", payload: content });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load folder";
      dispatch({ type: "LOAD_FAILURE", payload: message });
      toast.error(message);
    }
  }, []);

  const refreshContent = useCallback(async () => {
    if (state.currentFolder) {
      await loadFolderContent(state.currentFolder.id);
    }
  }, [state.currentFolder, loadFolderContent]);

  // UI 交互
  const toggleSelection = useCallback((itemId: string) => {
    dispatch({ type: "TOGGLE_SELECTION", payload: itemId });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: "CLEAR_SELECTION" });
  }, []);

  const setViewMode = useCallback((mode: "grid" | "list") => {
    dispatch({ type: "SET_VIEW_MODE", payload: mode });
  }, []);

  const value: FolderContextType = useMemo(
    () => ({
      ...state,
      loadFolderContent,
      refreshContent,
      toggleSelection,
      clearSelection,
      setViewMode,
    }),
    [
      state,
      loadFolderContent,
      refreshContent,
      toggleSelection,
      clearSelection,
      setViewMode,
    ]
  );

  return (
    <FolderContext.Provider value={value}>{children}</FolderContext.Provider>
  );
};
