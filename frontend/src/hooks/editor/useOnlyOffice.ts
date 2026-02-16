import { useState, useEffect } from "react";
import { fileService } from "@/services/file.service";

export interface OnlyOfficeConfig {
  url: string;
  token?: string;
}

/**
 * Hook for managing OnlyOffice configuration and state
 */
export const useOnlyOffice = (fileId: string | null) => {
  const [config, setConfig] = useState<OnlyOfficeConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) {
      setConfig(null);
      return;
    }

    const loadConfig = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const officeData = await fileService.getOfficeContentUrl(fileId);
        setConfig({
          url: officeData.url,
          token: officeData.token,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load OnlyOffice configuration";
        setError(message);
        setConfig(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [fileId]);

  return {
    config,
    isLoading,
    error,
  };
};
