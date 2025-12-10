import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from "react-router-dom";
import { AuthRoute } from "../components/auth/AuthRoute";
import { useAuth } from "@/hooks/auth/useAuth";
import { Spinner } from "@/components/ui/spinner";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import ProfilePage from "@/pages/profile/ProfilePage";
import FilesPage from "@/pages/files/FilesPage";
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
            path="/profile"
            element={
              <AuthRoute>
                <ProfilePage />
              </AuthRoute>
            }
          ></Route>
          <Route path="/" element={<RootRedirector />}></Route>
          <Route path="*" element={<NotFoundPage />}></Route>
        </Routes>
      </div>
    </Router>
  );
};
