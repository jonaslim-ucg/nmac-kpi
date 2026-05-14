import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { MainShell } from "@/components/dashboard/main-shell";

export default function DashboardPage() {
  return (
    <MainShell
      title="Performance overview"
      subtitle="Weekly KPIs — compare this year, last year, and your target (FY 2026)"
    >
      <DashboardClient />
    </MainShell>
  );
}
