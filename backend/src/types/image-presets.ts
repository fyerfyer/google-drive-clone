export const IMAGE_PRESETS = {
  avatar: {
    thumbnailSize: { width: 200, height: 200 },
    thumbnailQuality: 90,
    thumbnailExtension: "-thumb.png",
    logContext: "avatar",
  },
  icon: {
    thumbnailSize: { width: 128, height: 128 },
    thumbnailQuality: 95,
    thumbnailExtension: "-thumb.png",
    logContext: "icon",
  },
} as const;
