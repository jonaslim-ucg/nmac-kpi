import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { MainShell } from "@/components/dashboard/main-shell";

export default function DashboardPage() {
  return (
    <MainShell
      title="Dashboard"
      subtitle="Weekly KPIs — compare this year, last year, and your target"
    >
      <DashboardClient />
    </MainShell>
  );
}
