import axios from "axios";
import type { AxiosResponse, AxiosError } from "axios";
import { StatusCodes } from "http-status-codes";
import type { ApiError, ApiResponse } from "../types/api.types";

export const apiClient = axios.create({
  baseURL: "/",
  timeout: 30000, // TODO：有时候 LLM 调用返回时间过旧，可以采用监督是否有返回内容？
  headers: {
    "Content-Type": "application/json",
  },
});

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

  (error: AxiosError) => {
    if (error.response?.status === StatusCodes.UNAUTHORIZED) {
      // Don't redirect/clear token if we're already on login page or trying to login
      const isLoginRequest = error.config?.url?.includes("/auth/login");
      const isLoginPage = window.location.pathname === "/login";

      if (!isLoginRequest && !isLoginPage) {
        // 清空 Token 并重定向到登录页
        localStorage.removeItem("token");
        window.location.href = "/login";
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
