import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserPlus, X, Crown, Info } from "lucide-react";
import { toast } from "sonner";
import { userService } from "@/services/user.service";
import type { ResourceType, ResourcePermission } from "@/types/share.types";
import type { AccessRole } from "@/types/common.types";

interface Owner {
  name: string;
  email: string;
  avatar?: string;
}

interface SharePeopleTabProps {
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
  owner: Owner | null;
  permissions: ResourcePermission[];
  isLoading: boolean;
  onShareWithUsers: (
    resourceName: string,
    targetUserIds: string[],
    role: AccessRole,
  ) => Promise<void>;
  onRemovePermission: (targetUserId: string) => Promise<void>;
  onChangeRole: (targetUserId: string, newRole: AccessRole) => Promise<void>;
}

const roleOptions: { value: AccessRole; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
];

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

export const SharePeopleTab = ({
  resourceName,
  owner,
  permissions,
  isLoading,
  onShareWithUsers,
  onRemovePermission,
  onChangeRole,
}: SharePeopleTabProps) => {
  const [email, setEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState<AccessRole>("viewer");
  const [isSharing, setIsSharing] = useState(false);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSharing(true);
    try {
      // Search for user by email first
      const users = await userService.searchUsers(email.trim());

      if (users.length === 0) {
        toast.error("User not found with this email");
        return;
      }

      // Find exact match
      const exactUser = users.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
      );

      if (!exactUser) {
        toast.error("User not found with this exact email");
        return;
      }

      await onShareWithUsers(resourceName, [exactUser.id], selectedRole);
      setEmail("");
    } catch (error) {
      console.error("Share error:", error);
    } finally {
      setIsSharing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add people form */}
      <form onSubmit={handleAddUser} className="flex gap-2">
        <div className="relative flex-1">
          <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="email"
            placeholder="Add people by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={selectedRole}
          onValueChange={(v) => setSelectedRole(v as AccessRole)}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!email.trim() || isSharing}>
          {isSharing ? "Adding..." : "Add"}
        </Button>
      </form>

      <Separator />

      {/* People with access */}
      <div>
        <h4 className="text-sm font-medium mb-3">People with access</h4>
        <ScrollArea className="h-60 pr-4">
          <div className="space-y-3">
            {/* Owner */}
            {owner && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={owner.avatar} alt={owner.name} />
                    <AvatarFallback>{getInitials(owner.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{owner.name}</span>
                      <Crown className="h-3.5 w-3.5 text-yellow-500" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {owner.email}
                    </span>
                  </div>
                </div>
                <Badge variant="secondary">Owner</Badge>
              </div>
            )}

            {/* Shared users */}
            {permissions.map((permission) => (
              <PermissionRow
                key={`${permission.resourceId}-${permission.userId}`}
                permission={permission}
                onChangeRole={onChangeRole}
                onRemove={onRemovePermission}
              />
            ))}

            {permissions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No one else has access yet
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

interface PermissionRowProps {
  permission: ResourcePermission;
  onChangeRole: (targetUserId: string, newRole: AccessRole) => Promise<void>;
  onRemove: (targetUserId: string) => Promise<void>;
}

const PermissionRow = ({
  permission,
  onChangeRole,
  onRemove,
}: PermissionRowProps) => {
  const [isChanging, setIsChanging] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRoleChange = async (newRole: AccessRole) => {
    setIsChanging(true);
    try {
      await onChangeRole(permission.userId, newRole);
    } finally {
      setIsChanging(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await onRemove(permission.userId);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={permission.userAvatar} alt={permission.userName} />
          <AvatarFallback>
            {getInitials(permission.userName || permission.userEmail)}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{permission.userName}</span>
            {permission.isInherited && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Inherited from:{" "}
                      {permission.inheritedFrom?.resourceName ||
                        "parent folder"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {permission.userEmail}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={permission.role}
          onValueChange={handleRoleChange}
          disabled={isChanging || permission.isInherited}
        >
          <SelectTrigger className="w-[100px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!permission.isInherited && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRemove}
            disabled={isRemoving}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
