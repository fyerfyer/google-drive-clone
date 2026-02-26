import { AppSidebar } from "@/components/ui/app-sidebar";
import { SiteHeader } from "@/components/ui/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { StorageOverview } from "@/components/dashboard/StorageOverview";
import { AgentMonitor } from "@/components/dashboard/AgentMonitor";

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
              <div className="w-full max-w-7xl mx-auto">
                <div className="mb-6">
                  <h1 className="text-3xl font-bold tracking-tight">
                    Dashboard
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    Overview of your storage and recent activity
                  </p>
                </div>
                <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
                  <StorageOverview />
                  <AgentMonitor />
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
