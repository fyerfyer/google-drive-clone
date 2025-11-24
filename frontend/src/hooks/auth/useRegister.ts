import { useAuth } from "@/hooks/auth/useAuth";
import { useAuthForm } from "@/hooks/auth/useAuthForm";
import { registerSchema, type RegisterRequest } from "@/types/auth.types";

export const useRegister = () => {
  const { register } = useAuth();

  const {
    formData,
    setFormData,
    fieldErrors,
    setFieldErrors,
    isLoading,
    handleInputChange,
    handleSubmit,
  } = useAuthForm<RegisterRequest>({
    initialValues: {
      name: "",
      email: "",
      password: "",
      confirmpassword: "",
      avatarDataUrl: null,
    },
    validationSchema: registerSchema,
    onSubmit: register,
  });

  const handleAvatarChange = (dataUrl: string | null) => {
    setFormData((prev) => ({ ...prev, avatarDataUrl: dataUrl }));
    if (fieldErrors.avatarDataUrl) {
      setFieldErrors((prev) => ({ ...prev, avatarDataUrl: "" }));
    }
  };

  return {
    formData,
    fieldErrors,
    isLoading,
    handleInputChange,
    handleAvatarChange,
    handleSubmit,
  };
};
