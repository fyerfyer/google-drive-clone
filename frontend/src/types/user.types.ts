import z from "zod";

export interface Avatar {
  publicId: string;
  thumbnailId: string;
  url: string;
  thumbnail: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: Avatar;
  storageUsage: number;
  storageQuota: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserResponse {
  user: User;
  message?: string;
}

export const updateUserSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name cannot be more than 50 characters"),
});

export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
