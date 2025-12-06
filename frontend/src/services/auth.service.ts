import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from "@/types/auth.types";
import { api } from "./api";

const AUTH_API_BASE = "/api/auth";

type RegisterPayload = Omit<RegisterRequest, "avatarDataUrl"> & {
  avatarDataUrl?: string;
};

export const authService = {
  login: async (req: LoginRequest): Promise<AuthResponse> => {
    try {
      const response = await api.post<AuthResponse, LoginRequest>(
        `${AUTH_API_BASE}/login`,
        req
      );
      if (response.success && response.data) {
        localStorage.setItem("token", response.data.token);
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
        payload
      );
      if (response.success && response.data) {
        localStorage.setItem("token", response.data.token);
        return response.data;
      }

      throw new Error(response.message || "Registration failed");
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Registration failed"
      );
    }
  },

  logout: async (): Promise<void> => {
    try {
      await api.post(`${AUTH_API_BASE}/logout`);
    } catch (error) {
      // Ignore error, always clear local token
      console.error("Logout error:", error);
    } finally {
      localStorage.removeItem("token");
    }
  },

  isAuthenticated: (): boolean => {
    const token = localStorage.getItem("token");
    return !!token;
  },

  getToken: (): string | null => {
    return localStorage.getItem("token");
  },
};
