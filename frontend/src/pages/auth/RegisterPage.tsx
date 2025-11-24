import { RegisterForm } from "@/components/auth/RegisterForm";

function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="w-full max-w-md px-4">
        <RegisterForm />
      </div>
    </div>
  );
}

export default RegisterPage;
