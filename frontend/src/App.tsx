import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { AppRouter } from "@/router";
import { Toaster } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { useSocketConnection } from "@/hooks/useSocket";

function SocketProvider({ children }: { children: React.ReactNode }) {
  useSocketConnection();
  return <>{children}</>;
}

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      {isAuthenticated && <SocketProvider>{null}</SocketProvider>}
      <Toaster
        position="bottom-right"
        richColors
        expand={false}
        duration={3000}
        closeButton
      />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
