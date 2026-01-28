import type { IFile } from "@/types/file.types";
import type { Folder } from "@/types/folder.types";

// Base types for type guards
type FolderItem = Folder | IFile;
type RawFolder = Omit<Folder, "type"> & { type?: "folder" };
type RawFile = Omit<IFile, "type"> & { type?: "file" };

export function isFile(item: FolderItem): item is IFile {
  return item && "mimeType" in item && "size" in item;
}

export function isFolder(item: FolderItem): item is Folder {
  return item && "parent" in item && !("mimeType" in item);
}

export function normalizeFolder(folder: RawFolder): Folder {
  return {
    ...folder,
    type: "folder" as const,
  };
}

export function normalizeFile(file: RawFile): IFile {
  return {
    ...file,
    type: "file" as const,
  };
}

export function normalizeFolders(folders: RawFolder[]): Folder[] {
  return folders.map(normalizeFolder);
}

export function normalizeFiles(files: RawFile[]): IFile[] {
  return files.map(normalizeFile);
}
