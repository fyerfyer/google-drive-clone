import File, { IFile } from "../models/File.model";
import Folder, { IFolder } from "../models/Folder.model";

export interface ShortcutFileOverride {
  mimeType: string;
  size: number;
  extension: string;
  originalName: string;
}

export interface ShortcutFolderOverride {
  name: string;
  color: string;
  description?: string;
}

export async function buildShortcutFileOverrides(
  files: IFile[],
): Promise<Map<string, ShortcutFileOverride>> {
  const shortcutFiles = files.filter(
    (file) =>
      file.isShortcut &&
      file.shortcutTarget?.targetType === "File" &&
      !!file.shortcutTarget?.targetId,
  );

  if (shortcutFiles.length === 0) {
    return new Map();
  }

  const targetIds = shortcutFiles.map((file) => file.shortcutTarget!.targetId);
  const targetFiles = await File.find({
    _id: { $in: targetIds },
    isTrashed: false,
  })
    .select("mimeType size extension originalName")
    .lean();

  const targetMap = new Map(
    targetFiles.map((file: any) => [String(file._id), file]),
  );

  const overrides = new Map<string, ShortcutFileOverride>();
  for (const file of shortcutFiles) {
    const targetId = file.shortcutTarget!.targetId.toString();
    const target = targetMap.get(targetId);
    if (!target) continue;

    overrides.set(file.id, {
      mimeType: target.mimeType,
      size: target.size,
      extension: target.extension,
      originalName: target.originalName,
    });
  }

  return overrides;
}

export async function buildShortcutFolderOverrides(
  folders: IFolder[],
): Promise<Map<string, ShortcutFolderOverride>> {
  const shortcutFolders = folders.filter(
    (folder) =>
      folder.isShortcut &&
      folder.shortcutTarget?.targetType === "Folder" &&
      !!folder.shortcutTarget?.targetId,
  );

  if (shortcutFolders.length === 0) {
    return new Map();
  }

  const targetIds = shortcutFolders.map(
    (folder) => folder.shortcutTarget!.targetId,
  );
  const targetFolders = await Folder.find({
    _id: { $in: targetIds },
    isTrashed: false,
  })
    .select("name color description")
    .lean();

  const targetMap = new Map(
    targetFolders.map((folder: any) => [String(folder._id), folder]),
  );

  const overrides = new Map<string, ShortcutFolderOverride>();
  for (const folder of shortcutFolders) {
    const targetId = folder.shortcutTarget!.targetId.toString();
    const target = targetMap.get(targetId);
    if (!target) continue;

    overrides.set(folder.id, {
      name: target.name,
      color: target.color,
      description: target.description,
    });
  }

  return overrides;
}
