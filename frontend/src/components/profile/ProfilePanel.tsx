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
import { updateUserSchema } from "@/types/user.types";
import { userService } from "@/services/user.service";
import { useAuth } from "@/hooks/auth/useAuth";
import { ValidateAlert } from "@/components/auth/FormStatusAlert";
import { Spinner } from "@/components/ui/spinner";

interface FieldErrors {
  name?: string;
  avatarDataUrl?: string;
}

export const ProfilePanel = () => {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
    }
  }, [user]);

  // Auto-hide success message after 3 seconds
  useEffect(() => {
    if (status?.type === "success") {
      const timer = setTimeout(() => {
        setStatus(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    const result = updateUserSchema.safeParse({
      name,
      avatarDataUrl,
    });

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
        avatarDataUrl: result.data.avatarDataUrl ?? undefined,
      });
      setUser(response.user);
      setAvatarDataUrl(null);
      setStatus({
        type: "success",
        message: response.message || "Profile updated successfully",
      });
    } catch (error) {
      setStatus({
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
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <FieldGroup>
            {status && (
              <ValidateAlert
                isSuccess={status.type === "success"}
                message={status.message}
              />
            )}

            <Field>
              <FieldLabel>Avatar</FieldLabel>
              <AvatarUploader
                value={avatarDataUrl}
                onChange={(value) => {
                  setAvatarDataUrl(value);
                  if (fieldErrors.avatarDataUrl) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      avatarDataUrl: undefined,
                    }));
                  }
                }}
                disabled={isSaving}
                fallbackText={name}
                existingImageUrl={avatarUrl}
              />
              {fieldErrors.avatarDataUrl && (
                <p className="text-sm text-destructive">
                  {fieldErrors.avatarDataUrl}
                </p>
              )}
            </Field>

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
