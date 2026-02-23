import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from "react-router-dom";
import { AuthRoute } from "../components/auth/AuthRoute";
import { useAuth } from "@/hooks/auth/useAuth";
import { Spinner } from "@/components/ui/spinner";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { AgentTrigger } from "@/components/agent/AgentTrigger";
import { useAuthStore } from "@/stores/useAuthStore";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import ProfilePage from "@/pages/profile/ProfilePage";
import FilesPage from "@/pages/files/FilesPage";
import SharedAccessPage from "@/pages/share/SharedAccessPage";
import EditorPage from "@/pages/editor/EditorPage";
import NotFoundPage from "@/pages/NotFoundPage";

const RootRedirector = () => {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
};

function AgentOverlay() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return null;
  return (
    <>
      <AgentTrigger />
      <AgentPanel />
    </>
  );
}

export const AppRouter = () => {
  return (
    <Router>
      <div>
        <Routes>
          <Route path="/login" element={<LoginPage />}></Route>
          <Route path="/register" element={<RegisterPage />}></Route>
          <Route
            path="/dashboard"
            element={
              <AuthRoute>
                <DashboardPage />
              </AuthRoute>
            }
          ></Route>
          <Route
            path="/files"
            element={
              <AuthRoute>
                <FilesPage />
              </AuthRoute>
            }
          ></Route>
          <Route
            path="/editor"
            element={
              <AuthRoute>
                <EditorPage />
              </AuthRoute>
            }
          ></Route>
          <Route
            path="/profile"
            element={
              <AuthRoute>
                <ProfilePage />
              </AuthRoute>
            }
          ></Route>
          <Route
            path="/share/:type/:token"
            element={<SharedAccessPage />}
          ></Route>
          <Route path="/" element={<RootRedirector />}></Route>
          <Route path="*" element={<NotFoundPage />}></Route>
        </Routes>
      </div>
      <AgentOverlay />
    </Router>
  );
};
