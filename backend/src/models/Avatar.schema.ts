import { Schema } from "mongoose";

export interface IAvatar {
  publicId: string;
  thumbnailId: string;
  thumbnail: string;
  createdAt: Date;
}

export const avatarSchema = new Schema<IAvatar>(
  {
    publicId: {
      type: String,
      default: null,
    },
    thumbnailId: {
      type: String,
      default: null,
    },
    thumbnail: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);
