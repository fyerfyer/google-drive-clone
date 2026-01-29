import { create } from "zustand";
import type { ResourceType } from "@/types/share.types";

interface ShareDialogState {
  isOpen: boolean;
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
}

interface ShareDialogStore {
  dialog: ShareDialogState;
  openShareDialog: (
    resourceId: string,
    resourceType: ResourceType,
    resourceName: string,
  ) => void;
  closeShareDialog: () => void;
}

const initialState: ShareDialogState = {
  isOpen: false,
  resourceId: "",
  resourceType: "File",
  resourceName: "",
};

export const useShareDialogStore = create<ShareDialogStore>((set) => ({
  dialog: initialState,

  openShareDialog: (resourceId, resourceType, resourceName) => {
    set({
      dialog: {
        isOpen: true,
        resourceId,
        resourceType,
        resourceName,
      },
    });
  },

  closeShareDialog: () => {
    set({ dialog: initialState });
  },
}));
