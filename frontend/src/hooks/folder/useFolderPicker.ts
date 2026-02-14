import { useState, useCallback, useEffect } from "react";
import { folderService } from "@/services/folder.service";
import type { Folder } from "@/types/folder.types";

interface UseFolderPickerProps {
  initialFolderId?: string;
  isOpen?: boolean;
}

interface Breadcrumb {
  id: string;
  name: string;
}

export const useFolderPicker = ({
  initialFolderId = "root",
  isOpen = false,
}: UseFolderPickerProps = {}) => {
  const [currentFolderId, setCurrentFolderId] =
    useState<string>(initialFolderId);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([
    { id: "root", name: "My Drive" },
  ]);
  const [loading, setLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const loadFolders = useCallback(async (parentId: string) => {
    setLoading(true);
    try {
      const response = await folderService.getFolderContent(parentId);
      if (response && response.folders) {
        setFolders(response.folders);
      }
    } catch (error) {
      console.error("Failed to load folders", error);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset/Initialize when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCurrentFolderId(initialFolderId);
      setBreadcrumbs([{ id: "root", name: "My Drive" }]);
      setSelectedFolderId(null);
      loadFolders(initialFolderId);
    }
  }, [isOpen, initialFolderId, loadFolders]);

  const navigateToFolder = useCallback(
    (folder: { id: string; name: string }) => {
      setCurrentFolderId(folder.id);
      setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
      loadFolders(folder.id);
      setSelectedFolderId(null);
    },
    [loadFolders],
  );

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      const target = breadcrumbs[index];
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      setCurrentFolderId(target.id);
      loadFolders(target.id);
      setSelectedFolderId(null);
    },
    [breadcrumbs, loadFolders],
  );

  const navigateBack = useCallback(() => {
    if (breadcrumbs.length > 1) {
      navigateToBreadcrumb(breadcrumbs.length - 2);
    }
  }, [breadcrumbs, navigateToBreadcrumb]);

  const selectFolder = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
  }, []);

  return {
    currentFolderId,
    folders,
    breadcrumbs,
    loading,
    selectedFolderId,
    navigateToFolder,
    navigateToBreadcrumb,
    navigateBack,
    selectFolder,
    refresh: () => loadFolders(currentFolderId),
  };
};
