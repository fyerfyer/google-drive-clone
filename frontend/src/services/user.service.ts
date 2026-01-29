import type {
  User,
  UserResponse,
  UsersSearchResponse,
} from "@/types/user.types";
import { api } from "./api";

const USER_API_BASE = "/api/users";

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
        error instanceof Error ? error.message : "Failed to get user profile",
      );
    }
  },

  searchUsers: async (email: string): Promise<User[]> => {
    try {
      const response = await api.get<UsersSearchResponse>(
        `${USER_API_BASE}/search?email=${encodeURIComponent(email)}`,
      );
      if (response.success && response.data) {
        return response.data.users;
      }
      throw new Error(response.message || "Failed to search users");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to search users",
      );
    }
  },

  updateUser: async (data: {
    name?: string;
    email?: string;
  }): Promise<UserResponse> => {
    try {
      const response = await api.patch<UserResponse, typeof data>(
        `${USER_API_BASE}/profile`,
        data,
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
        error instanceof Error
          ? error.message
          : "Failed to update user profile",
      );
    }
  },

  /**
   * Update user avatar separately
   * @param key - The MinIO object key returned after avatar upload
   */
  updateAvatar: async (key: string): Promise<UserResponse> => {
    try {
      const response = await api.patch<UserResponse, { key: string }>(
        `${USER_API_BASE}/avatar`,
        { key },
      );
      if (response.success && response.data) {
        return {
          user: response.data.user,
          message: response.message,
        };
      }

      throw new Error(response.message || "Failed to update avatar");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Failed to update avatar",
      );
    }
  },
};
