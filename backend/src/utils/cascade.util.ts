import mongoose from "mongoose";
import File from "../models/File.model";
import Folder from "../models/Folder.model";
import { SharedAccess } from "../models/SharedAccess.model";
import { ShareLink } from "../models/ShareLink.model";
import User from "../models/User.model";
import { Notification } from "../models/Notification.model";
import { notificationQueue } from "../lib/queue/queue";
import { NOTIFICATION_TYPES, QUEUE_TASKS } from "../types/model.types";

export async function revokeSharedAccessAndNotify(
  resourceIds: mongoose.Types.ObjectId[],
  resourceType: "File" | "Folder",
  ownerId: string,
  session?: mongoose.ClientSession,
) {
  if (resourceIds.length === 0) return;

  const sharedAccesses = await SharedAccess.find({
    resource: { $in: resourceIds },
    resourceType,
  })
    .select("resource sharedWith")
    .session(session || null);

  if (sharedAccesses.length === 0) {
    await ShareLink.updateMany(
      { resourceId: { $in: resourceIds }, resourceType, isRevoked: false },
      { isRevoked: true, revokedAt: new Date() },
      { session: session || undefined },
    );
    return;
  }

  const resourceToUsers = new Map<string, Set<string>>();
  sharedAccesses.forEach((sa: any) => {
    const rId = sa.resource.toString();
    const uId = sa.sharedWith.toString();
    if (!resourceToUsers.has(rId)) resourceToUsers.set(rId, new Set());
    resourceToUsers.get(rId)!.add(uId);
  });

  const resources =
    resourceType === "File"
      ? await File.find({ _id: { $in: resourceIds } })
          .select("name")
          .session(session || null)
      : await Folder.find({ _id: { $in: resourceIds } })
          .select("name")
          .session(session || null);

  const resourceMap = new Map(resources.map((r) => [r._id.toString(), r.name]));

  await ShareLink.updateMany(
    { resourceId: { $in: resourceIds }, resourceType, isRevoked: false },
    { isRevoked: true, revokedAt: new Date() },
    { session: session || undefined },
  );

  await SharedAccess.deleteMany(
    { resource: { $in: resourceIds }, resourceType },
    { session: session || undefined },
  );

  const resourceIdStrs = resourceIds.map((id) => id.toString());
  await Notification.deleteMany(
    {
      type: {
        $in: [NOTIFICATION_TYPES.FILE_SHARED, NOTIFICATION_TYPES.FOLDER_SHARED],
      },
      $or: [
        { "data.resourceId": { $in: resourceIdStrs } },
        { "data.items.resourceId": { $in: resourceIdStrs } },
        { "resources.resourceId": { $in: resourceIds } },
      ],
    },
    { session: session || undefined },
  );

  const owner = await User.findById(ownerId)
    .select("name")
    .session(session || null);
  const ownerName = owner?.name || "The owner";

  const promises: Promise<any>[] = [];
  for (const [rId, users] of resourceToUsers.entries()) {
    const resourceName = resourceMap.get(rId) || "Resource";
    for (const userId of users) {
      if (userId === ownerId) continue;

      const notificationData = {
        title: `${resourceType} deleted`,
        body: `${ownerName} deleted shared ${resourceType.toLowerCase()} "${resourceName}"`,
        actionUrl: "/files?view=shared",
        resourceId: rId,
        resourceType,
        resourceName,
        items: [{ resourceId: rId, kind: resourceType }],
      };

      promises.push(
        notificationQueue.add(QUEUE_TASKS.SEND_SHARE, {
          recipientId: userId,
          senderId: ownerId,
          type: NOTIFICATION_TYPES.ACCESS_REVOKED,
          data: notificationData,
        }),
      );
    }
  }

  await Promise.all(promises);
}

export async function cascadeTrashShortcuts(
  resourceIds: mongoose.Types.ObjectId[],
  resourceType: "File" | "Folder",
  session?: mongoose.ClientSession,
) {
  if (resourceIds.length === 0) return;
  if (resourceType === "File") {
    await File.updateMany(
      { isShortcut: true, "shortcutTarget.targetId": { $in: resourceIds } },
      { isTrashed: true, trashedAt: new Date() },
      { session: session || undefined },
    );
  } else {
    await Folder.updateMany(
      { isShortcut: true, "shortcutTarget.targetId": { $in: resourceIds } },
      { isTrashed: true, trashedAt: new Date() },
      { session: session || undefined },
    );
  }
}

export async function cascadeRestoreShortcuts(
  resourceIds: mongoose.Types.ObjectId[],
  resourceType: "File" | "Folder",
  session?: mongoose.ClientSession,
) {
  if (resourceIds.length === 0) return;
  if (resourceType === "File") {
    await File.updateMany(
      { isShortcut: true, "shortcutTarget.targetId": { $in: resourceIds } },
      { isTrashed: false, trashedAt: null },
      { session: session || undefined },
    );
  } else {
    await Folder.updateMany(
      { isShortcut: true, "shortcutTarget.targetId": { $in: resourceIds } },
      { isTrashed: false, trashedAt: null },
      { session: session || undefined },
    );
  }
}

export async function cascadeDeleteShortcuts(
  resourceIds: mongoose.Types.ObjectId[],
  resourceType: "File" | "Folder",
  session?: mongoose.ClientSession,
) {
  if (resourceIds.length === 0) return;
  if (resourceType === "File") {
    await File.deleteMany(
      { isShortcut: true, "shortcutTarget.targetId": { $in: resourceIds } },
      { session: session || undefined },
    );
  } else {
    await Folder.deleteMany(
      { isShortcut: true, "shortcutTarget.targetId": { $in: resourceIds } },
      { session: session || undefined },
    );
  }
}
