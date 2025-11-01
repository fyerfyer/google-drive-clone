export interface ErrorResponse {
  success: false;
  message: string;
  error?: string;
  stack?: string;
}
