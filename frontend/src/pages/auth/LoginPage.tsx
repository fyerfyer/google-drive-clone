import { LoginForm } from "@/components/auth/LoginForm";

function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="w-full max-w-md px-4">
        <LoginForm />
      </div>
    </div>
  );
}

export default LoginPage;
