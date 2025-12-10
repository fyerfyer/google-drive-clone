import type { CSSProperties } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { SiteHeader } from "@/components/ui/site-header";
import { ProfilePanel } from "@/components/profile/ProfilePanel";

const ProfilePage = () => {
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
        <div className="flex flex-1 flex-col px-4 py-6 lg:px-10">
          <div className="w-full max-w-4xl mx-auto">
            <ProfilePanel />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default ProfilePage;
