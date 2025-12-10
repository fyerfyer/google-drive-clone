import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AvatarUploader } from "@/components/avatar/AvatarUploader";
import { updateUserSchema, type User } from "@/types/user.types";
import { userService } from "@/services/user.service";
import { useAuth } from "@/hooks/auth/useAuth";
import { ValidateAlert } from "@/components/auth/FormStatusAlert";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";

interface FieldErrors {
  name?: string;
}

export const ProfilePanel = () => {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [profileStatus, setProfileStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
    }
  }, [user]);

  // Auto-hide success messages
  useEffect(() => {
    if (profileStatus?.type === "success") {
      const timer = setTimeout(() => {
        setProfileStatus(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [profileStatus]);

  useEffect(() => {
    if (avatarStatus?.type === "success") {
      const timer = setTimeout(() => {
        setAvatarStatus(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [avatarStatus]);

  const email = useMemo(() => user?.email ?? "", [user]);
  const avatarUrl = useMemo(
    () => user?.avatar?.thumbnail || user?.avatar?.url || null,
    [user]
  );

  if (!user) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  const handleAvatarUploadSuccess = (result: User | string | undefined) => {
    if (result && typeof result !== "string") {
      setUser(result);
      setAvatarStatus({
        type: "success",
        message: "Avatar updated successfully",
      });
      return;
    }

    setAvatarStatus({
      type: "success",
      message: "Avatar uploaded successfully",
    });
  };

  const handleAvatarUploadError = (error: string) => {
    setAvatarStatus({
      type: "error",
      message: error,
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileStatus(null);

    const result = updateUserSchema.safeParse({ name });

    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSaving(true);

    try {
      const response = await userService.updateUser({
        name: result.data.name,
      });
      setUser(response.user);
      setProfileStatus({
        type: "success",
        message: response.message || "Profile updated successfully",
      });
    } catch (error) {
      setProfileStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to update profile",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar Section - Updates immediately */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Avatar</h3>
            <p className="text-sm text-muted-foreground">
              Upload a new avatar. Changes are saved automatically.
            </p>
          </div>

          {avatarStatus && (
            <ValidateAlert
              isSuccess={avatarStatus.type === "success"}
              message={avatarStatus.message}
            />
          )}

          <AvatarUploader
            fallbackText={name}
            existingImageUrl={avatarUrl}
            onUploadSuccess={handleAvatarUploadSuccess}
            onUploadError={handleAvatarUploadError}
          />
        </div>

        <Separator />

        {/* Profile Form - Requires submit */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <FieldGroup>
            {profileStatus && (
              <ValidateAlert
                isSuccess={profileStatus.type === "success"}
                message={profileStatus.message}
              />
            )}

            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (fieldErrors.name) {
                    setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                disabled={isSaving}
              />
              <FieldDescription>
                This is your display name within the workspace.
              </FieldDescription>
              {fieldErrors.name && (
                <p className="text-sm text-destructive">{fieldErrors.name}</p>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" value={email} disabled readOnly />
              <FieldDescription>
                Email changes are currently managed by administrators.
              </FieldDescription>
            </Field>

            <Field>
              <Button type="submit" disabled={isSaving} className="w-full">
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
};
