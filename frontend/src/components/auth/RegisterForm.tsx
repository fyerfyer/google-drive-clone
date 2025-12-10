import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Link } from "react-router-dom";
import { useRegister } from "@/hooks/auth/useRegister";
import { useAuth } from "@/hooks/auth/useAuth";
import { ValidateAlert } from "./FormStatusAlert";
import { useEffect } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

export function RegisterForm({ ...props }: React.ComponentProps<typeof Card>) {
  const { formData, fieldErrors, isLoading, handleInputChange, handleSubmit } =
    useRegister();
  const { error, clearError } = useAuth();

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle className="text-2xl">Create an account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            {error && <ValidateAlert isSuccess={false} message={error} />}

            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <InputGroup data-disabled={isLoading}>
                <InputGroupInput
                  id="name"
                  name="name"
                  type="text"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  required
                />
                {isLoading && (
                  <InputGroupAddon align="inline-end">
                    <Spinner />
                  </InputGroupAddon>
                )}
              </InputGroup>
              {fieldErrors.name && (
                <p className="text-sm text-destructive">{fieldErrors.name}</p>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <InputGroup data-disabled={isLoading}>
                <InputGroupInput
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  required
                />
                {isLoading && (
                  <InputGroupAddon align="inline-end">
                    <Spinner />
                  </InputGroupAddon>
                )}
              </InputGroup>
              {fieldErrors.email && (
                <p className="text-sm text-destructive">{fieldErrors.email}</p>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <InputGroup data-disabled={isLoading}>
                <InputGroupInput
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  required
                />
                {isLoading && (
                  <InputGroupAddon align="inline-end">
                    <Spinner />
                  </InputGroupAddon>
                )}
              </InputGroup>
              <FieldDescription>
                Must be at least 2 characters long.
              </FieldDescription>
              {fieldErrors.password && (
                <p className="text-sm text-destructive">
                  {fieldErrors.password}
                </p>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="confirmpassword">
                Confirm Password
              </FieldLabel>
              <InputGroup data-disabled={isLoading}>
                <InputGroupInput
                  id="confirmpassword"
                  name="confirmpassword"
                  type="password"
                  autoComplete="new-password"
                  value={formData.confirmpassword}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  required
                />
                {isLoading && (
                  <InputGroupAddon align="inline-end">
                    <Spinner />
                  </InputGroupAddon>
                )}
              </InputGroup>
              {fieldErrors.confirmpassword && (
                <p className="text-sm text-destructive">
                  {fieldErrors.confirmpassword}
                </p>
              )}
            </Field>

            <FieldGroup>
              <Field>
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? "Creating account..." : "Create Account"}
                </Button>
                <FieldDescription className="px-6 text-center">
                  Already have an account?{" "}
                  <Link to="/login" className="underline underline-offset-4">
                    Sign in
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
