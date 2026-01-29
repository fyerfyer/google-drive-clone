import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useShareDialogStore } from "@/stores/useShareDialogStore";
import { useResourceShare } from "@/hooks/share/useShare";
import { SharePeopleTab } from "@/components/share/SharePeopleTab";
import { ShareLinkTab } from "@/components/share/ShareLinkTab";
import { Users, Link } from "lucide-react";

export const ShareDialog = () => {
  const { dialog, closeShareDialog } = useShareDialogStore();
  const [activeTab, setActiveTab] = useState<"people" | "link">("people");

  const { isOpen, resourceId, resourceType, resourceName } = dialog;

  const {
    owner,
    permissions,
    linkShare,
    isLoading,
    shareWithUsers,
    removeUserPermission,
    changeUserRole,
    updateLinkSettings,
    copyLink,
  } = useResourceShare(resourceId, resourceType, isOpen);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeShareDialog();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Share "{resourceName}"
          </DialogTitle>
          <DialogDescription>
            Manage access to this {resourceType.toLowerCase()}. You can share
            with specific people or generate a shareable link.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "people" | "link")}
          className="mt-2"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="people" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              People
            </TabsTrigger>
            <TabsTrigger value="link" className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="people" className="mt-4">
            <SharePeopleTab
              resourceId={resourceId}
              resourceType={resourceType}
              resourceName={resourceName}
              owner={owner}
              permissions={permissions}
              isLoading={isLoading}
              onShareWithUsers={shareWithUsers}
              onRemovePermission={removeUserPermission}
              onChangeRole={changeUserRole}
            />
          </TabsContent>

          <TabsContent value="link" className="mt-4">
            <ShareLinkTab
              resourceType={resourceType}
              linkShare={linkShare}
              isLoading={isLoading}
              onUpdateLinkSettings={updateLinkSettings}
              onCopyLink={copyLink}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
