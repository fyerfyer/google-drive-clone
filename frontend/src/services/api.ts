import axios from "axios";
import type { AxiosResponse, AxiosError } from "axios";
import { StatusCodes } from "http-status-codes";
import type { ApiError, ApiResponse } from "../types/api.types";

export const apiClient = axios.create({
  baseURL: "/",
  timeout: 10000,
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
  }
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },

  (error: AxiosError) => {
    if (error.response?.status === StatusCodes.UNAUTHORIZED) {
      // 清空 Token 并重定向到登录页
      localStorage.removeItem("token");
      window.location.href = "/login";
    }

    const apiError: ApiError = {
      message: error.message || "An unexpected error occurred",
      status: error.status,
      code: error.code,
    };

    return Promise.reject(apiError);
  }
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
    data?: D
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
