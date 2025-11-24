import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { LoginRequest, RegisterRequest } from "@/types/auth.types";
import {
  AuthContext,
  type AuthContextType,
  type AuthState,
} from "@/contexts/auth/context";
import { authService } from "@/services/auth.service";
import { userService } from "@/services/user.service";
import type { User } from "@/types/user.types";

type AuthAction =
  | { type: "AUTH_START" }
  | { type: "AUTH_SUCCESS"; payload: { user: User; token: string } }
  | { type: "AUTH_FAILURE"; payload: string }
  | { type: "LOGOUT" }
  | { type: "CLEAR_ERROR" }
  | { type: "INITIALIZE_AUTH" }
  | { type: "UPDATE_USER"; payload: User };

const initState: AuthState = {
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
};

interface AuthProviderProps {
  children: ReactNode;
}

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case "AUTH_START":
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case "AUTH_SUCCESS":
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case "AUTH_FAILURE":
      return {
        ...state,
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
        error: action.payload,
      };
    case "LOGOUT":
      return {
        ...state,
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      };
    case "CLEAR_ERROR":
      return {
        ...state,
        error: null,
      };

    case "INITIALIZE_AUTH":
      return {
        ...state,
        isLoading: false,
      };
    case "UPDATE_USER":
      return {
        ...state,
        user: action.payload,
      };
  }

  return state;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [state, dispatch] = useReducer(authReducer, initState);

  // Initialize auth on app startup
  useEffect(() => {
    const initializeAuth = async () => {
      const token = authService.getToken();
      if (token) {
        try {
          dispatch({ type: "AUTH_START" });
          const user = await userService.getCurrentUser();
          dispatch({ type: "AUTH_SUCCESS", payload: { user, token } });
        } catch (error) {
          authService.logout();
          dispatch({
            type: "AUTH_FAILURE",
            payload: `Session expired: ${error}`,
          });
        }
      } else {
        dispatch({ type: "INITIALIZE_AUTH" });
      }
    };

    initializeAuth();
  }, []);

  const login = useCallback(async (req: LoginRequest): Promise<void> => {
    try {
      dispatch({ type: "AUTH_START" });
      const response = await authService.login(req);
      dispatch({
        type: "AUTH_SUCCESS",
        payload: { user: response.user, token: response.token },
      });
    } catch (error) {
      let errorMessage = "Login error";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      dispatch({ type: "AUTH_FAILURE", payload: errorMessage });
      throw error;
    }
  }, []);

  const register = useCallback(async (req: RegisterRequest): Promise<void> => {
    try {
      dispatch({ type: "AUTH_START" });
      const response = await authService.register(req);
      dispatch({
        type: "AUTH_SUCCESS",
        payload: { user: response.user, token: response.token },
      });
    } catch (error) {
      let errorMessage = "Login error";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      dispatch({ type: "AUTH_FAILURE", payload: errorMessage });
      throw error;
    }
  }, []);

  const logout = useCallback((): void => {
    authService.logout();
    dispatch({ type: "LOGOUT" });
  }, []);

  const clearError = useCallback((): void => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  const setUser = useCallback((user: User): void => {
    dispatch({ type: "UPDATE_USER", payload: user });
  }, []);

  const value: AuthContextType = useMemo(
    () => ({
      ...state,
      login,
      register,
      logout,
      clearError,
      setUser,
    }),
    [state, login, register, logout, clearError, setUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
