import { useEffect } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  handler: () => void;
}

/**
 * Hook for registering keyboard shortcuts
 */
export const useKeyboardShortcuts = (shortcuts: KeyboardShortcut[]) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const ctrlMatch =
          shortcut.ctrlKey === undefined ||
          shortcut.ctrlKey === e.ctrlKey ||
          (shortcut.ctrlKey && e.metaKey); 

        const metaMatch =
          shortcut.metaKey === undefined || shortcut.metaKey === e.metaKey;

        const shiftMatch =
          shortcut.shiftKey === undefined || shortcut.shiftKey === e.shiftKey;

        const altMatch =
          shortcut.altKey === undefined || shortcut.altKey === e.altKey;

        if (
          e.key === shortcut.key &&
          ctrlMatch &&
          metaMatch &&
          shiftMatch &&
          altMatch
        ) {
          e.preventDefault();
          shortcut.handler();
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);
};

/**
 * Hook for handling Escape key
 */
export const useEscapeKey = (handler: () => void, enabled = true) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handler();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handler, enabled]);
};
