export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message: string;
  error?: ApiError;
}
