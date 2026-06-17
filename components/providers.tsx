"use client";

import { AppThemeProvider } from "@/components/app-theme-provider";
import { ActivityLogger } from "@/components/auth/activity-logger";
import { DashboardPreferencesProvider } from "@/components/auth/dashboard-preferences-provider";
import { SessionProvider } from "@/components/auth/session-provider";
import type { AppDashboardSettings } from "@/lib/auth/app-settings";
import type { SessionUser } from "@/lib/auth/session-user";

export function Providers({
  children,
  initialSessionUser,
  initialDashboardSettings = null,
}: {
  children: React.ReactNode;
  initialSessionUser: SessionUser | null;
  initialDashboardSettings?: AppDashboardSettings | null;
}) {
  return (
    <AppThemeProvider defaultTheme="dark">
      <SessionProvider initialUser={initialSessionUser}>
        <ActivityLogger />
        <DashboardPreferencesProvider initialPreferences={initialDashboardSettings}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </DashboardPreferencesProvider>
      </SessionProvider>
    </AppThemeProvider>
  );
}
