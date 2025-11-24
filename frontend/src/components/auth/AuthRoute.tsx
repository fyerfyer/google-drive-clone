import { type ReactNode } from "react";
import { useAuth } from "@/hooks/auth/useAuth";
import { Navigate, useLocation } from "react-router-dom";
import { Spinner } from "@/components/ui/spinner";

interface AuthRouteProps {
  children: ReactNode;
  redirectTo?: string;
}

export const AuthRoute = ({
  children,
  redirectTo = "/login",
}: AuthRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
