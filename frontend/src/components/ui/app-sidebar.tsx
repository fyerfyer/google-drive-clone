import * as React from "react";
import {
  IconDashboard,
  IconFolder,
  IconStar,
  IconTrash,
  IconClock,
  IconCloudUp,
} from "@tabler/icons-react";

import { NavMain } from "@/components/nav/nav-main";
import { NavUser } from "@/components/nav/nav-user";
import { useAuth } from "@/hooks/auth/useAuth";
import GoogleDriveIcon from "@/assets/GoogleDriveIcon.svg";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: IconDashboard,
    },
    {
      title: "My Drive",
      url: "/files",
      icon: IconCloudUp,
    },
  ],
  navStorage: [
    {
      title: "My Files",
      url: "/files?view=files",
      icon: IconFolder,
    },
    {
      title: "Recent",
      url: "/files?view=recent",
      icon: IconClock,
    },
    {
      title: "Starred",
      url: "/files?view=starred",
      icon: IconStar,
    },
    {
      title: "Trash",
      url: "/files?view=trash",
      icon: IconTrash,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const auth = useAuth();

  const userProp = auth?.user
    ? {
        name: auth.user.name,
        email: auth.user.email,
        avatar: auth.user.avatar || {
          url: "",
          thumbnail: "",
        },
      }
    : {
        name: "Guest",
        email: "",
        avatar: {
          url: "/avatars/default.png",
          thumbnail: "/avatars/default.png",
        },
      };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="#" className="flex items-center gap-2">
                <img
                  src={GoogleDriveIcon}
                  alt="Google Drive Icon"
                  className="w-6 h-6"
                />
                <span className="text-base font-semibold">
                  Google Drive Copy
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavMain items={data.navStorage} hideQuickCreate />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userProp} />
      </SidebarFooter>
    </Sidebar>
  );
}
