import { AppRouter } from "@/router";
import { AuthProvider } from "@/contexts/auth/provider";
import { FolderProvider } from "@/contexts/folder/provider";
import { Toaster } from "sonner";

function App() {
  return (
    <AuthProvider>
      <FolderProvider>
        <AppRouter />
        <Toaster position="bottom-right" richColors expand={false} />
      </FolderProvider>
    </AuthProvider>
  );
}

export default App;
