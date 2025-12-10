import { useAuth } from "@/hooks/auth/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { HardDrive } from "lucide-react";

export const StorageOverview = () => {
  const { user } = useAuth();

  if (!user) return null;

  const usagePercent = (user.storageUsage / user.storageQuota) * 100;
  const usageGB = (user.storageUsage / (1024 * 1024 * 1024)).toFixed(2);
  const quotaGB = (user.storageQuota / (1024 * 1024 * 1024)).toFixed(2);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="size-5" />
          Storage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Used</span>
            <span className="font-medium">
              {usageGB} GB of {quotaGB} GB
            </span>
          </div>
          <Progress value={usagePercent} className="h-2" />
        </div>
        <p className="text-xs text-muted-foreground">
          {usagePercent < 80
            ? `You have ${(parseFloat(quotaGB) - parseFloat(usageGB)).toFixed(
                2
              )} GB available`
            : usagePercent < 95
            ? "You're running low on storage space"
            : "Storage almost full! Consider upgrading"}
        </p>
      </CardContent>
    </Card>
  );
};
