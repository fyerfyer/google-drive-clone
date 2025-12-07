import { AppRouter } from "@/router";
import { AuthProvider } from "@/contexts/auth/provider";
import { FolderProvider } from "@/contexts/folder/provider";

function App() {
  return (
    <AuthProvider>
      <FolderProvider>
        <AppRouter />
      </FolderProvider>
    </AuthProvider>
  );
}

export default App;
