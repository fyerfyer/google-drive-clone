import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { LoginRequest, RegisterRequest } from "@/types/auth.types";
import type { User } from "@/types/user.types";
import { authService } from "@/services/auth.service";
import { userService } from "@/services/user.service";
import { toast } from "sonner";

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export interface AuthActions {
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  setUser: (user: User) => void;
  initializeAuth: () => Promise<void>;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  devtools(
    (set) => ({
      // Initial state
      user: null,
      token: null,
      isLoading: true,
      isAuthenticated: false,
      error: null,

      // Initialize auth on app startup
      initializeAuth: async () => {
        const token = authService.getToken();
        if (token) {
          try {
            set({ isLoading: true, error: null }, false, "auth/init-start");
            const user = await userService.getCurrentUser();
            set(
              {
                user,
                token,
                isAuthenticated: true,
                isLoading: false,
                error: null,
              },
              false,
              "auth/init-success",
            );
          } catch (error) {
            authService.logout();
            set(
              {
                user: null,
                token: null,
                isAuthenticated: false,
                isLoading: false,
                error: `Session expired: ${error}`,
              },
              false,
              "auth/init-failure",
            );
          }
        } else {
          set({ isLoading: false }, false, "auth/init-no-token");
        }
      },

      // Login
      login: async (req: LoginRequest) => {
        try {
          set({ isLoading: true, error: null }, false, "auth/login-start");
          const response = await authService.login(req);
          set(
            {
              user: response.user,
              token: response.token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            },
            false,
            "auth/login-success",
          );
          toast.success("Logged in successfully");
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Login error";
          set(
            {
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
              error: errorMessage,
            },
            false,
            "auth/login-failure",
          );
          toast.error(errorMessage);
          throw error;
        }
      },

      // Register
      register: async (req: RegisterRequest) => {
        try {
          set({ isLoading: true, error: null }, false, "auth/register-start");
          const response = await authService.register(req);
          set(
            {
              user: response.user,
              token: response.token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            },
            false,
            "auth/register-success",
          );
          toast.success("Registered successfully");
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Registration error";
          set(
            {
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
              error: errorMessage,
            },
            false,
            "auth/register-failure",
          );
          toast.error(errorMessage);
          throw error;
        }
      },

      // Logout
      logout: () => {
        authService.logout();
        set(
          {
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          },
          false,
          "auth/logout",
        );
      },

      // Clear error
      clearError: () => {
        set({ error: null }, false, "auth/clear-error");
      },

      // Set user
      setUser: (user: User) => {
        set({ user }, false, "auth/set-user");
      },
    }),
    { name: "AuthStore" },
  ),
);
