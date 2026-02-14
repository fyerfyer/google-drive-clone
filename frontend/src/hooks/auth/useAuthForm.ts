import { useAuth } from "@/hooks/auth/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { z } from "zod";

interface UseAuthFormProps<T extends Record<string, unknown>> {
  initialValues: T;
  validationSchema: z.ZodSchema<T>;
  onSubmit: (data: T) => Promise<void>;
}

export type FieldErrors<T extends Record<string, unknown>> = Partial<
  Record<keyof T, string>
>;

export interface UseAuthFormReturn<T extends Record<string, unknown>> {
  formData: T;
  setFormData: Dispatch<SetStateAction<T>>;
  fieldErrors: FieldErrors<T>;
  setFieldErrors: Dispatch<SetStateAction<FieldErrors<T>>>;
  isLoading: boolean;
  handleInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export const useAuthForm = <T extends Record<string, unknown>>({
  initialValues,
  validationSchema,
  onSubmit,
}: UseAuthFormProps<T>): UseAuthFormReturn<T> => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState<T>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<T>>({});

  // Redirect any authenticated user away from auth routes.
  useEffect(() => {
    if (isAuthenticated) {
      const params = new URLSearchParams(location.search);
      const redirect = params.get("redirect");
      // Use redirect parameter if exists, otherwise fallback to location.state.from, then dashboard
      // Note: decodeURIComponent is generally handled by URLSearchParams
      const from = redirect || location.state?.from || "/dashboard";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, location, navigate]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name as keyof T]) {
      setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = (): boolean => {
    const result = validationSchema.safeParse(formData);
    if (result.success) {
      setFieldErrors({});
      return true;
    }

    const errors: FieldErrors<T> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof T;
      errors[key] = issue.message;
    }

    setFieldErrors(errors);
    return false;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) {
      return;
    }

    await onSubmit(formData);
  };

  return {
    formData,
    setFormData,
    fieldErrors,
    setFieldErrors,
    isLoading,
    handleInputChange,
    handleSubmit,
  };
};
