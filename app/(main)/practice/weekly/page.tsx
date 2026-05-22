import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { MainShell } from "@/components/dashboard/main-shell";

export default function WeeklyKpisPage() {
  return (
    <MainShell
      title="Weekly KPIs"
      subtitle="Compare this year, last year, and your target (FY 2026)"
    >
      <DashboardClient />
    </MainShell>
  );
}
