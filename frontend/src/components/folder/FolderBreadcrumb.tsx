import { useNavigate } from "react-router-dom";
import { useFolder } from "@/hooks/folder/useFolder";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ChevronRight, Home } from "lucide-react";

export const FolderBreadcrumb = () => {
  const { breadcrumbs, currentFolder } = useFolder();
  const navigate = useNavigate();

  const handleNavigate = (folderId: string) => {
    if (folderId === "root") {
      navigate("/files");
    } else {
      navigate(`/files?folder=${folderId}`);
    }
  };

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink
            className="flex items-center gap-1 cursor-pointer"
            onClick={() => handleNavigate("root")}
          >
            <Home className="size-4" />
            My Drive
          </BreadcrumbLink>
        </BreadcrumbItem>

        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <div key={item.id} className="flex items-center">
              <BreadcrumbSeparator>
                <ChevronRight className="size-4" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                {isLast && currentFolder?.id === item.id ? (
                  <BreadcrumbPage className="line-clamp-1 max-w-[200px]">
                    {item.name}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="cursor-pointer line-clamp-1 max-w-[200px]"
                    onClick={() => handleNavigate(item.id)}
                  >
                    {item.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
