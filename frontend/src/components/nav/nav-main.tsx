import { IconCirclePlusFilled, type Icon } from "@tabler/icons-react";
import { useNavigate, useLocation } from "react-router-dom";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavMain({
  items,
  hideQuickCreate,
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
  }[];
  hideQuickCreate?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const isActive =
              location.pathname === item.url ||
              (item.url.includes("?") &&
                location.pathname + location.search === item.url);

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  onClick={() => navigate(item.url)}
                  isActive={isActive}
                >
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
