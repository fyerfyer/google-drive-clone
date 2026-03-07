import { io, Socket } from "socket.io-client";
import axios from "axios";

let socket: Socket | null = null;
let isRefreshingForSocket = false;

async function refreshTokenForSocket(): Promise<string | null> {
  if (isRefreshingForSocket) return null;
  isRefreshingForSocket = true;
  try {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return null;
    const { data } = await axios.post("/api/auth/refresh", { refreshToken });
    if (data.success && data.data) {
      localStorage.setItem("token", data.data.token);
      localStorage.setItem("refreshToken", data.data.refreshToken);
      return data.data.token;
    }
    return null;
  } catch {
    return null;
  } finally {
    isRefreshingForSocket = false;
  }
}

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem("token");
    socket = io(window.location.origin, {
      auth: { token },
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: false, // We handle reconnection manually on auth errors
    });

    // Handle auth errors: refresh token and retry once
    socket.on("connect_error", async (err) => {
      const isAuthError =
        err.message?.includes("401") ||
        err.message?.toLowerCase().includes("unauthorized") ||
        err.message?.toLowerCase().includes("authentication");

      if (isAuthError && socket) {
        const newToken = await refreshTokenForSocket();
        if (newToken) {
          socket.auth = { token: newToken };
          socket.connect();
        }
        // If refresh failed, don't retry — user will be logged out by HTTP interceptor
      }
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    // Update auth token before connecting
    const token = localStorage.getItem("token");
    s.auth = { token };
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
