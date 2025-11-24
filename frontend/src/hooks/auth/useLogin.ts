import { loginSchema, type LoginRequest } from "@/types/auth.types";
import { useAuth } from "@/hooks/auth/useAuth";
import { useAuthForm } from "@/hooks/auth/useAuthForm";

export const useLogin = () => {
  const { login } = useAuth();

  return useAuthForm<LoginRequest>({
    initialValues: {
      email: "",
      password: "",
    },
    validationSchema: loginSchema,
    onSubmit: login,
  });
};
