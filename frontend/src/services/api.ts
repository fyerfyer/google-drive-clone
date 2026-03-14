import axios from "axios";
import type {
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";
import { StatusCodes } from "http-status-codes";
import type { ApiError, ApiResponse } from "../types/api.types";

export const apiClient = axios.create({
  baseURL: "/",
  timeout: 30000, // TODO：有时候 LLM 调用返回时间过旧，可以采用监督是否有返回内容？
  withCredentials: true, // Ensure cookies (e.g. refreshToken) are sent with cross-origin requests
  headers: {
    "Content-Type": "application/json",
  },
});

// Refresh token state to avoid concurrent refresh requests
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },

  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Don't retry refresh or login requests
    const isAuthRequest =
      originalRequest?.url?.includes("/auth/login") ||
      originalRequest?.url?.includes("/auth/register") ||
      originalRequest?.url?.includes("/auth/refresh");

    if (
      error.response?.status === StatusCodes.UNAUTHORIZED &&
      !isAuthRequest &&
      !originalRequest?._retry
    ) {
      if (isRefreshing) {
        // Queue requests while refresh is in progress
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Refresh token is sent automatically via HttpOnly cookie
        const { data } = await axios.post(
          "/api/auth/refresh",
          {},
          { withCredentials: true },
        );

        if (data.success && data.data) {
          const newToken = data.data.token;
          localStorage.setItem("token", newToken);
          onTokenRefreshed(newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Only clear tokens and redirect on a genuine auth failure (401/403).
        // Do NOT log the user out on a server/network error (5xx, no response).
        const refreshStatus = (
          refreshError as { response?: { status?: number } }
        )?.response?.status;
        const isAuthFailure = refreshStatus === 401 || refreshStatus === 403;
        if (isAuthFailure) {
          localStorage.removeItem("token");
          localStorage.removeItem("deviceId");
          const isLoginPage = window.location.pathname === "/login";
          if (!isLoginPage) {
            window.location.href = "/login";
          }
        }
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    const responseData = error.response?.data as
      | { message?: string }
      | undefined;

    const apiError: ApiError = {
      message:
        responseData?.message ||
        error.message ||
        "An unexpected error occurred",
      status: error.response?.status,
      code: error.code,
    };

    return Promise.reject(apiError);
  },
);

export const api = {
  get: <T>(url: string): Promise<ApiResponse<T>> => {
    return apiClient.get<ApiResponse<T>>(url).then((response) => response.data);
  },

  post: <T, D>(url: string, data?: D): Promise<ApiResponse<T>> => {
    return apiClient
      .post<ApiResponse<T>>(url, data)
      .then((response) => response.data);
  },

  put: <T, D>(url: string, data?: D): Promise<ApiResponse<T>> => {
    return apiClient
      .put<ApiResponse<T>>(url, data)
      .then((response) => response.data);
  },

  delete: <T, D = undefined>(
    url: string,
    data?: D,
  ): Promise<ApiResponse<T>> => {
    return apiClient
      .delete<ApiResponse<T>>(url, data ? { data } : undefined)
      .then((response) => response.data);
  },

  patch: <T, D>(url: string, data?: D): Promise<ApiResponse<T>> => {
    return apiClient
      .patch<ApiResponse<T>>(url, data)
      .then((response) => response.data);
  },
};
