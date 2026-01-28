import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { SiteHeader } from "@/components/ui/site-header";
import { FolderBrowser } from "@/components/folder/FolderBrowser";
import { SpecialView } from "@/components/folder/SpecialView";

const FilesPage = () => {
  const [searchParams] = useSearchParams();
  const view = searchParams.get("view");
  const folderId = searchParams.get("folder") || "root";

  return (
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
          {view ? (
            <SpecialView
              viewType={view as "recent" | "starred" | "trash" | "files"}
            />
          ) : (
            <FolderBrowser initialFolderId={folderId} />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default FilesPage;
