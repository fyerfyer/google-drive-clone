import { SharedAccess } from "../../models/SharedAccess.model";
import User, { IUser } from "../../models/User.model";
import Folder, { IFolder } from "../../models/Folder.model";
import File from "../../models/File.model";
import {
  AccessRole,
  ResourceType,
  LinkShareScope,
} from "../../types/model.types";
import mongoose from "mongoose";

export async function createTestUser(
  name: string,
  email: string,
): Promise<IUser> {
  return await User.create({
    name,
    email,
    password: "hashedpassword",
    storageUsage: 0,
    storageQuota: 1024 * 1024 * 1024,
  });
}

export async function createTestFolder(
  userId: string,
  name: string,
  parent: string | null = null,
  ancestors: mongoose.Types.ObjectId[] = [],
): Promise<IFolder> {
  return await Folder.create({
    name,
    user: userId,
    parent,
    ancestors,
    isTrashed: false,
  });
}

export async function createTestFile(
  userId: string,
  folderId: string,
  name: string,
  ancestors: mongoose.Types.ObjectId[] = [],
) {
  return await File.create({
    name,
    user: userId,
    folder: folderId,
    ancestors,
    size: 1024,
    mimeType: "text/plain",
    extension: "txt",
    isTrashed: false,
    isStarred: false,
    originalName: name,
  });
}

export async function createSharedAccess(
  resourceId: string,
  resourceType: ResourceType,
  sharedBy: string,
  sharedWith: string,
  role: AccessRole,
  expiresAt?: Date,
) {
  return await SharedAccess.create({
    resourceType,
    resource: resourceId,
    sharedBy,
    sharedWith,
    role,
    expiresAt,
  });
}

export async function setLinkShare(
  resourceId: string,
  resourceType: ResourceType,
  config: {
    enableLinkSharing: boolean;
    role: AccessRole;
    scope: LinkShareScope;
    password?: string;
    token?: string;
    expiresAt?: Date;
    allowDownload?: boolean;
  },
) {
  let resource;
  if (resourceType === "Folder") {
    resource = await Folder.findById(resourceId);
  } else {
    resource = await File.findById(resourceId);
  }

  if (!resource) {
    throw new Error("Resource not found");
  }

  resource.linkShare = {
    ...config,
    allowDownload: config.allowDownload ?? true,
  } as any;
  await resource.save();
  return resource;
}

export async function getSharedAccessForResource(
  resourceId: string,
): Promise<any[]> {
  return await SharedAccess.find({ resource: resourceId }).lean();
}

export async function cleanupSharedAccess(): Promise<void> {
  await SharedAccess.deleteMany({});
}
