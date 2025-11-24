import type {
  UpdateRequest,
  UpdateUserResponse,
  User,
} from "@/types/user.types";
import { api } from "./api";

type UpdatePayload = Omit<UpdateRequest, "avatarDataUrl"> & {
  avatarDataUrl?: string;
};

export const userService = {
  getCurrentUser: async (): Promise<User> => {
    try {
      const response = await api.get<User>("/api/auth/profile");
      if (response.success && response.data) {
        return response.data;
      }

      throw new Error(response.message || "Failed to get user profile");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to get user profile"
      );
    }
  },

  updateUser: async (req: UpdateRequest): Promise<UpdateUserResponse> => {
    try {
      const { avatarDataUrl, ...rest } = req;
      const payload: UpdatePayload = avatarDataUrl
        ? { ...rest, avatarDataUrl }
        : rest;

      const response = await api.patch<User, UpdatePayload>(
        "/api/auth/update",
        payload
      );
      if (response.success && response.data) {
        return {
          user: response.data,
          message: response.message || "Profile updated successfully",
        };
      }

      throw new Error(response.message || "Failed to update user profile");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to update user profile"
      );
    }
  },
};
