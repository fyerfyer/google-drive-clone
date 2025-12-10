import { AppSidebar } from "@/components/ui/app-sidebar";
import { SiteHeader } from "@/components/ui/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { StorageOverview } from "@/components/dashboard/StorageOverview";
import { RecentFiles } from "@/components/dashboard/RecentFiles";
import { QuickActions } from "@/components/dashboard/QuickActions";

export function Dashboard() {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col">
            <div className="flex flex-col gap-4 p-4 md:gap-6 lg:p-6">
              <div className="w-full max-w-7xl mx-auto space-y-4 md:space-y-6">
                <QuickActions />
                <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
                  <StorageOverview />
                  <RecentFiles />
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
