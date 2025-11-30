import multer from "multer";

const storage = multer.memoryStorage();

export const fileUpload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB for all files
  },
});

export const avatarUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB for avatars
  },
});
