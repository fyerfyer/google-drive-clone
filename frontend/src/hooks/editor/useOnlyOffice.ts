import { useState, useEffect } from "react";
import { fileService } from "@/services/file.service";
import type { OnlyOfficeConfig } from "@/types/onlyoffice.types";

export interface OnlyOfficeResult {
  url: string;
  token?: string;
  config?: OnlyOfficeConfig;
}

/**
 * Hook for managing OnlyOffice configuration and state
 */
export const useOnlyOffice = (fileId: string | null) => {
  const [result, setResult] = useState<OnlyOfficeResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) {
      setResult(null);
      return;
    }

    const loadConfig = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const officeData = await fileService.getOfficeContentUrl(fileId);
        setResult({
          url: officeData.url,
          token: officeData.token,
          config: officeData.config,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load OnlyOffice configuration";
        setError(message);
        setResult(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [fileId]);

  return {
    config: result ? { url: result.url, token: result.token } : null,
    /** The full OnlyOffice document config from backend (includes callbackUrl) */
    serverConfig: result?.config || null,
    isLoading,
    error,
  };
};
