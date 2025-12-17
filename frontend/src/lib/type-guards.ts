import type { IFile } from "@/types/file.types";
import type { Folder } from "@/types/folder.types";

/**
 * Type guard to check if an item is a File
 */
export function isFile(item: any): item is IFile {
  return item && "mimeType" in item && "size" in item;
}

/**
 * Type guard to check if an item is a Folder
 */
export function isFolder(item: any): item is Folder {
  return item && "parent" in item && !("mimeType" in item);
}

/**
 * Add type discriminator to raw folder data from backend
 */
export function normalizeFolder(folder: any): Folder {
  return {
    ...folder,
    type: "folder" as const,
  };
}

/**
 * Add type discriminator to raw file data from backend
 */
export function normalizeFile(file: any): IFile {
  return {
    ...file,
    type: "file" as const,
  };
}

/**
 * Normalize an array of folders
 */
export function normalizeFolders(folders: any[]): Folder[] {
  return folders.map(normalizeFolder);
}

/**
 * Normalize an array of files
 */
export function normalizeFiles(files: any[]): IFile[] {
  return files.map(normalizeFile);
}
