import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from "@/types/auth.types";
import { api } from "./api";
import type { SessionInfo } from "@/types/session.types";

const AUTH_API_BASE = "/api/auth";

type RegisterPayload = Omit<RegisterRequest, "avatarDataUrl"> & {
  avatarDataUrl?: string;
};

export const authService = {
  login: async (req: LoginRequest): Promise<AuthResponse> => {
    try {
      const response = await api.post<AuthResponse, LoginRequest>(
        `${AUTH_API_BASE}/login`,
        req,
      );
      if (response.success && response.data) {
        localStorage.setItem("token", response.data.token);
        localStorage.setItem("deviceId", response.data.deviceId);
        return response.data;
      }
      throw new Error(response.message || "Login failed");
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Login failed");
    }
  },

  register: async (req: RegisterRequest): Promise<AuthResponse> => {
    try {
      const { avatarDataUrl, ...rest } = req;
      const payload: RegisterPayload = avatarDataUrl
        ? { ...rest, avatarDataUrl }
        : rest;

      const response = await api.post<AuthResponse, RegisterPayload>(
        `${AUTH_API_BASE}/register`,
        payload,
      );
      if (response.success && response.data) {
        localStorage.setItem("token", response.data.token);
        localStorage.setItem("deviceId", response.data.deviceId);
        return response.data;
      }

      throw new Error(response.message || "Registration failed");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Registration failed",
      );
    }
  },

  refreshToken: async (): Promise<{ token: string }> => {
    // Refresh token is sent automatically via HttpOnly cookie
    const response = await api.post<{ token: string }, undefined>(
      `${AUTH_API_BASE}/refresh`,
    );

    if (response.success && response.data) {
      localStorage.setItem("token", response.data.token);
      return response.data;
    }

    throw new Error("Token refresh failed");
  },

  logout: async (): Promise<void> => {
    try {
      await api.post(`${AUTH_API_BASE}/logout`);
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("deviceId");
    }
  },

  isAuthenticated: (): boolean => {
    const token = localStorage.getItem("token");
    return !!token;
  },

  getToken: (): string | null => {
    return localStorage.getItem("token");
  },

  getDeviceId: (): string | null => {
    return localStorage.getItem("deviceId");
  },

  getSessions: async (): Promise<SessionInfo[]> => {
    const response = await api.get<{ sessions: SessionInfo[] }>(
      `${AUTH_API_BASE}/sessions`,
    );
    if (response.success && response.data) {
      return response.data.sessions;
    }
    throw new Error("Failed to fetch sessions");
  },

  revokeSession: async (deviceId: string): Promise<void> => {
    await api.delete(`${AUTH_API_BASE}/sessions/${deviceId}`);
  },
};
