"use client";

import { AppThemeProvider } from "@/components/app-theme-provider";
import { DashboardPreferencesProvider } from "@/components/auth/dashboard-preferences-provider";
import { SessionProvider } from "@/components/auth/session-provider";
import type { SessionUser } from "@/lib/auth/session-user";

export function Providers({
  children,
  initialSessionUser,
}: {
  children: React.ReactNode;
  initialSessionUser: SessionUser | null;
}) {
  return (
    <AppThemeProvider defaultTheme="dark">
      <SessionProvider initialUser={initialSessionUser}>
        <DashboardPreferencesProvider>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </DashboardPreferencesProvider>
      </SessionProvider>
    </AppThemeProvider>
  );
}
