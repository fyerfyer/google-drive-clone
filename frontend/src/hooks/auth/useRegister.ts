import { useAuth } from "@/hooks/auth/useAuth";
import { useAuthForm } from "@/hooks/auth/useAuthForm";
import { registerSchema, type RegisterRequest } from "@/types/auth.types";

export const useRegister = () => {
  const { register } = useAuth();

  const { formData, fieldErrors, isLoading, handleInputChange, handleSubmit } =
    useAuthForm<Omit<RegisterRequest, "avatarDataUrl">>({
      initialValues: {
        name: "",
        email: "",
        password: "",
        confirmpassword: "",
      },
      validationSchema: registerSchema.omit({ avatarDataUrl: true }),
      onSubmit: register,
    });

  return {
    formData,
    fieldErrors,
    isLoading,
    handleInputChange,
    handleSubmit,
  };
};
