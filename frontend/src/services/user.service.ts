import type { UpdateUserRequest, User, UserResponse } from "@/types/user.types";
import { api } from "./api";

const USER_API_BASE = "/api/users";

type UpdatePayload = Omit<UpdateUserRequest, "avatarDataUrl"> & {
  avatarDataUrl?: string;
};

export const userService = {
  getCurrentUser: async (): Promise<User> => {
    try {
      const response = await api.get<UserResponse>(`${USER_API_BASE}/profile`);
      if (response.success && response.data) {
        return response.data.user;
      }

      throw new Error(response.message || "Failed to get user profile");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to get user profile"
      );
    }
  },

  updateUser: async (req: UpdateUserRequest): Promise<UserResponse> => {
    try {
      const { avatarDataUrl, ...rest } = req;
      const payload: UpdatePayload = avatarDataUrl
        ? { ...rest, avatarDataUrl }
        : rest;

      const response = await api.patch<UserResponse, UpdatePayload>(
        `${USER_API_BASE}/profile`,
        payload
      );
      if (response.success && response.data) {
        return {
          user: response.data.user,
          message: response.message,
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
