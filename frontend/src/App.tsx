import { AppRouter } from "@/router";
import { Toaster } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import { useEffect } from "react";

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <>
      <AppRouter />
      <Toaster position="bottom-right" richColors expand={false} />
    </>
  );
}

export default App;
