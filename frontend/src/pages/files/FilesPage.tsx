import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { SiteHeader } from "@/components/ui/site-header";
import { FolderProvider } from "@/contexts/folder/provider";
import { FolderBrowser } from "@/components/folder/FolderBrowser";

const FilesPage = () => {
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("folder") || "root";

  return (
    <FolderProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col">
            <FolderBrowser initialFolderId={folderId} />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </FolderProvider>
  );
};

export default FilesPage;
