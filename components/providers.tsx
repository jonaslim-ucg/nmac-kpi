"use client";

import { ThemeProvider } from "next-themes";
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
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="nmac-kpi-theme"
      disableTransitionOnChange
    >
      <SessionProvider initialUser={initialSessionUser}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </SessionProvider>
    </ThemeProvider>
  );
}
