import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileIcon, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// This will be replaced with real data from API
const mockRecentFiles = [
  {
    id: "1",
    name: "Project Proposal.pdf",
    size: 2048576,
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    name: "Meeting Notes.docx",
    size: 524288,
    updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "3",
    name: "Budget Spreadsheet.xlsx",
    size: 1048576,
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const RecentFiles = () => {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-5" />
          Recent Files
        </CardTitle>
      </CardHeader>
      <CardContent>
        {mockRecentFiles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No recent files
          </p>
        ) : (
          <div className="space-y-3">
            {mockRecentFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <FileIcon className="size-8 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)} •{" "}
                    {formatDistanceToNow(new Date(file.updatedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
