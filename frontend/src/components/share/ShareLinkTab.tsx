import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Copy, Globe, Lock, ExternalLink } from "lucide-react";
import { shareService } from "@/services/share.service";
import type {
  ResourceType,
  LinkShareConfig,
  LinkShareScope,
} from "@/types/share.types";
import type { AccessRole } from "@/types/common.types";

interface ShareLinkTabProps {
  resourceType: ResourceType;
  linkShare: LinkShareConfig | null;
  isLoading: boolean;
  onUpdateLinkSettings: (
    linkShareConfig: Partial<LinkShareConfig>,
  ) => Promise<{ token: string | null; linkShareConfig: LinkShareConfig }>;
  onCopyLink: (token: string) => Promise<void>;
}

const roleOptions: { value: AccessRole; label: string; description: string }[] =
  [
    {
      value: "viewer",
      label: "Viewer",
      description: "Can view and download",
    },
    {
      value: "editor",
      label: "Editor",
      description: "Can view, download, and edit",
    },
  ];

const scopeOptions: {
  value: LinkShareScope;
  label: string;
  icon: React.ElementType;
}[] = [
  { value: "anyone", label: "Anyone with the link", icon: Globe },
  { value: "none", label: "Restricted", icon: Lock },
];

export const ShareLinkTab = ({
  resourceType,
  linkShare,
  isLoading,
  onUpdateLinkSettings,
  onCopyLink,
}: ShareLinkTabProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const handleToggleLinkShare = async (enabled: boolean) => {
    setIsUpdating(true);
    try {
      await onUpdateLinkSettings({ enableLinkSharing: enabled });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRoleChange = async (role: AccessRole) => {
    setIsUpdating(true);
    try {
      await onUpdateLinkSettings({ role });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleScopeChange = async (scope: LinkShareScope) => {
    setIsUpdating(true);
    try {
      if (scope === "none") {
        await onUpdateLinkSettings({ enableLinkSharing: false });
      } else {
        await onUpdateLinkSettings({ scope, enableLinkSharing: true });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAllowDownloadChange = async (allowDownload: boolean) => {
    setIsUpdating(true);
    try {
      await onUpdateLinkSettings({ allowDownload });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!linkShare?.token) return;
    setIsCopying(true);
    try {
      await onCopyLink(linkShare.token);
    } finally {
      setIsCopying(false);
    }
  };

  const shareLink = linkShare?.token
    ? shareService.generateShareLink(linkShare.token, resourceType)
    : "";

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const isEnabled = linkShare?.enableLinkSharing && linkShare?.scope !== "none";

  return (
    <div className="space-y-5">
      {/* Link access toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="link-sharing">Link sharing</Label>
          <p className="text-xs text-muted-foreground">
            Allow anyone with the link to access
          </p>
        </div>
        <Switch
          id="link-sharing"
          checked={isEnabled}
          onCheckedChange={handleToggleLinkShare}
          disabled={isUpdating}
        />
      </div>

      {isEnabled && linkShare && (
        <>
          <Separator />

          {/* Share link */}
          <div className="space-y-2">
            <Label>Share link</Label>
            <div className="flex gap-2">
              <Input value={shareLink} readOnly className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
                disabled={isCopying || !linkShare.token}
              >
                <Copy className="h-4 w-4" />
              </Button>
              {linkShare.token && (
                <Button variant="outline" size="icon" asChild>
                  <a href={shareLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Access settings */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Who can access</Label>
              <Select
                value={linkShare.scope}
                onValueChange={(v) => handleScopeChange(v as LinkShareScope)}
                disabled={isUpdating}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <option.icon className="h-4 w-4" />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Permission</Label>
              <Select
                value={linkShare.role}
                onValueChange={(v) => handleRoleChange(v as AccessRole)}
                disabled={isUpdating}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col items-start">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {linkShare.role === "viewer" && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-download">Allow download</Label>
                  <p className="text-xs text-muted-foreground">
                    Viewers can download the file
                  </p>
                </div>
                <Switch
                  id="allow-download"
                  checked={linkShare.allowDownload}
                  onCheckedChange={handleAllowDownloadChange}
                  disabled={isUpdating}
                />
              </div>
            )}
          </div>
        </>
      )}

      {!isEnabled && (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Link sharing is disabled. Enable it to generate a shareable link.
          </p>
        </div>
      )}
    </div>
  );
};
