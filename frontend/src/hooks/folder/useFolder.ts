import {
  FolderContext,
  type FolderContextType,
} from "@/contexts/folder/context";
import { useContext } from "react";

export const useFolder = (): FolderContextType => {
  const context = useContext(FolderContext);
  if (context === undefined) {
    throw new Error("useFolder must be used within a FolderProvider");
  }

  return context;
};
