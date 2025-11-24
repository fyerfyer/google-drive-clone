import { z } from "zod";
import { MAX_AVATAR_SIZE_BYTES, MAX_AVATAR_SIZE_MB } from "./constants";
import type { User } from "./user.types";

const AVATAR_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,/i;

const getBase64Size = (dataUrl: string): number => {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
};

export interface AuthResponse {
  user: User;
  token: string;
  message: string;
}

export const loginSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export type LoginRequest = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(50, "Name cannot be more than 50 characters"),
    email: z.email("Invalid email format"),
    password: z
      .string()
      .min(2, "Password must be at least 2 characters")
      .max(20, "Password cannot be more than 20 characters"),
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
    confirmpassword: z
      .string()
      .min(2, "Password must be at least 2 characters")
      .max(20, "Password cannot be more than 20 characters"),
  })
  .refine((data) => data.password === data.confirmpassword, {
    message: "Passwords don't match",
    path: ["confirmpassword"],
  });

export type RegisterRequest = z.infer<typeof registerSchema>;
