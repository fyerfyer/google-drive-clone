import { AppRouter } from "@/router";
import { AuthProvider } from "@/contexts/auth/provider";

function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

export default App;