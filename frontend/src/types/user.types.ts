import z from "zod";
import { MAX_AVATAR_SIZE_BYTES, MAX_AVATAR_SIZE_MB } from "./constants";

export interface Avatar {
  url: string;
  thumbnail: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: Avatar;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserResponse {
  user: User;
  message: string;
}

const AVATAR_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,/i;

const getBase64Size = (dataUrl: string): number => {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
};

export const updateSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name cannot be more than 50 characters"),
  avatarDataUrl: z
    .string()
    .regex(AVATAR_DATA_URL_PATTERN, {
      message: "Invalid avatar format. Use PNG, JPG, or WEBP.",
    })
    .refine((value) => getBase64Size(value) <= MAX_AVATAR_SIZE_BYTES, {
      message: `Avatar must be smaller than ${MAX_AVATAR_SIZE_MB}MB`,
    })
    .optional()
    .nullable(),
});

export type UpdateRequest = z.infer<typeof updateSchema>;
