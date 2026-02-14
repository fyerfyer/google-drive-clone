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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Copy,
  Globe,
  Lock,
  ExternalLink,
  Settings,
  RefreshCw,
} from "lucide-react";
import { shareService } from "@/services/share.service";
import type {
  ResourceType,
  ShareLinkInfo,
  CreateShareLinkOptions,
  UpdateShareLinkOptions,
} from "@/types/share.types";
import type { AccessRole } from "@/types/common.types";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ShareLinkTabProps {
  resourceType: ResourceType;
  shareLink: ShareLinkInfo | null;
  isLoading: boolean;
  onCreateLink: (options?: CreateShareLinkOptions) => Promise<unknown>;
  onUpdateLink: (options: UpdateShareLinkOptions) => Promise<unknown>;
  onRotateLink: () => Promise<unknown>;
  onRevokeLink: () => Promise<unknown>;
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

export const ShareLinkTab = ({
  resourceType,
  shareLink,
  isLoading,
  onCreateLink,
  onUpdateLink,
  onRotateLink,
  onRevokeLink,
  onCopyLink,
}: ShareLinkTabProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const handleToggleLinkShare = async (enabled: boolean) => {
    setIsUpdating(true);
    try {
      if (enabled) {
        // Create a basic viewer link by default
        await onCreateLink({ role: "viewer" });
      } else {
        // Revoke the link
        await onRevokeLink();
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRoleChange = async (role: AccessRole) => {
    setIsUpdating(true);
    try {
      await onUpdateLink({ role });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateSetting = async (options: UpdateShareLinkOptions) => {
    setIsUpdating(true);
    try {
      await onUpdateLink(options);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRotateLink = async () => {
    setIsUpdating(true);
    try {
      await onRotateLink();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink?.token) return;
    setIsCopying(true);
    try {
      await onCopyLink(shareLink.token);
    } finally {
      setIsCopying(false);
    }
  };

  const generateLinkUrl = (token: string) =>
    shareService.generateShareLink(token, resourceType);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const isEnabled = !!shareLink;

  return (
    <div className="space-y-5">
      {/* Link access toggle/header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="link-sharing">General access</Label>
          <div className="flex items-center text-sm text-muted-foreground">
            {isEnabled ? (
              <>
                <Globe className="mr-1 h-3 w-3" />
                Anyone with the link
              </>
            ) : (
              <>
                <Lock className="mr-1 h-3 w-3" />
                Restricted
              </>
            )}
          </div>
        </div>

        <Select
          value={isEnabled ? "anyone" : "restricted"}
          onValueChange={(v) => handleToggleLinkShare(v === "anyone")}
          disabled={isUpdating}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="restricted">
              <div className="flex items-center">
                <Lock className="mr-2 h-4 w-4 text-muted-foreground" />
                Restricted
              </div>
            </SelectItem>
            <SelectItem value="anyone">
              <div className="flex items-center">
                <Globe className="mr-2 h-4 w-4 text-primary" />
                Anyone with the link
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isEnabled && shareLink && (
        <>
          <Separator />

          {/* Role and Advanced Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-4">
                <Label>Role</Label>
                <Select
                  value={shareLink.role}
                  onValueChange={(v) => handleRoleChange(v as AccessRole)}
                  disabled={isUpdating}
                >
                  <SelectTrigger className="w-full mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium">{option.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="mt-6">
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">
                        Link Settings
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Configure security options for this link.
                      </p>
                    </div>
                    {/* Expiration */}
                    <div className="grid gap-2">
                      <Label htmlFor="expires">Expiration</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !shareLink.expiresAt && "text-muted-foreground",
                            )}
                          >
                            <span>
                              {shareLink.expiresAt
                                ? format(new Date(shareLink.expiresAt), "PPP")
                                : "No expiration"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={
                              shareLink.expiresAt
                                ? new Date(shareLink.expiresAt)
                                : undefined
                            }
                            onSelect={(date: Date | undefined) =>
                              handleUpdateSetting({ expiresAt: date || null })
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Password */}
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password protection</Label>
                        <Switch
                          id="password-toggle"
                          checked={shareLink.hasPassword}
                          onCheckedChange={(checked) => {
                            if (!checked)
                              handleUpdateSetting({ password: null });
                            else setShowPassword(true);
                          }}
                        />
                      </div>
                      {(shareLink.hasPassword || showPassword) && (
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            placeholder="Set new password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                          <Button
                            size="sm"
                            onClick={async () => {
                              const trimmedPassword = newPassword.trim();
                              if (!trimmedPassword) return;
                              await handleUpdateSetting({
                                password: trimmedPassword,
                              });
                              setNewPassword("");
                              setShowPassword(false);
                            }}
                            disabled={!newPassword.trim()}
                          >
                            Set
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Require Login */}
                    <div className="flex items-center justify-between">
                      <Label htmlFor="require-login">Require login</Label>
                      <Switch
                        id="require-login"
                        checked={shareLink.requireLogin}
                        onCheckedChange={(c) =>
                          handleUpdateSetting({ requireLogin: c })
                        }
                      />
                    </div>

                    {/* Allow Download (only for viewer) */}
                    {shareLink.role === "viewer" && (
                      <div className="flex items-center justify-between">
                        <Label htmlFor="allow-download">Allow download</Label>
                        <Switch
                          id="allow-download"
                          checked={shareLink.allowDownload}
                          onCheckedChange={(c) =>
                            handleUpdateSetting({ allowDownload: c })
                          }
                        />
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Separator />

          {/* Share link input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Link</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleRotateLink}
                disabled={isUpdating}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                Reset link
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={generateLinkUrl(shareLink.token)}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
                disabled={isCopying}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" asChild>
                <a
                  href={generateLinkUrl(shareLink.token)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </>
      )}

      {!isEnabled && (
        <div className="rounded-lg border border-dashed p-6 text-center bg-muted/20">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <h3 className="text-sm font-medium">Access is restricted</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Only people added directly can access this{" "}
            {resourceType.toLowerCase()}
          </p>
          <Button
            variant="outline"
            onClick={() => handleToggleLinkShare(true)}
            disabled={isUpdating}
          >
            Change to anyone with the link
          </Button>
        </div>
      )}
    </div>
  );
};
