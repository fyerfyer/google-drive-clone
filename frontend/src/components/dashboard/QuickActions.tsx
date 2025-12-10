import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderPlus, Upload, FileSearch } from "lucide-react";

export const QuickActions = () => {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button
          onClick={() => navigate("/files")}
          className="flex-1 min-w-[150px]"
        >
          <FolderPlus className="size-4" />
          New Folder
        </Button>
        <Button
          onClick={() => navigate("/files")}
          variant="outline"
          className="flex-1 min-w-[150px]"
        >
          <Upload className="size-4" />
          Upload Files
        </Button>
        <Button
          onClick={() => navigate("/files")}
          variant="outline"
          className="flex-1 min-w-[150px]"
        >
          <FileSearch className="size-4" />
          Browse Files
        </Button>
      </CardContent>
    </Card>
  );
};
