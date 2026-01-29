import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { SiteHeader } from "@/components/ui/site-header";
import { FolderBrowser } from "@/components/folder/FolderBrowser";
import { SpecialView } from "@/components/folder/SpecialView";
import { SharedWithMeView } from "@/components/share/SharedWithMeView";
import { ShareDialog } from "@/components/share/ShareDialog";

const FilesPage = () => {
  const [searchParams] = useSearchParams();
  const view = searchParams.get("view");
  const folderId = searchParams.get("folder") || "root";

  const renderContent = () => {
    if (view === "shared") {
      return (
        <div className="p-4 lg:p-6 w-full max-w-[1920px] mx-auto">
          <SharedWithMeView />
        </div>
      );
    }
    if (view) {
      return (
        <SpecialView
          viewType={view as "recent" | "starred" | "trash" | "files"}
        />
      );
    }
    return <FolderBrowser initialFolderId={folderId} />;
  };

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
        <div className="flex flex-1 flex-col">{renderContent()}</div>
      </SidebarInset>
      <ShareDialog />
    </SidebarProvider>
  );
};

export default FilesPage;
