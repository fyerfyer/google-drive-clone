import { useAuthStore } from "@/stores/useAuthStore";

export const useAuth = () => {
  return useAuthStore();
};
