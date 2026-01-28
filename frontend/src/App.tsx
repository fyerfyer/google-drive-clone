import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { AppRouter } from "@/router";
import { Toaster } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <Toaster position="bottom-right" richColors expand={false} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
