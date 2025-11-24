import { Dashboard } from "@/components/dashboard/Dashboard";

function DashboardPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="w-full max-w-md">
        <Dashboard />
      </div>
    </div>
  );
}

export default DashboardPage;