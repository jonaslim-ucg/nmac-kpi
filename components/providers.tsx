"use client";

import { ThemeProvider } from "next-themes";
import { MockRoleProvider } from "@/components/dashboard/mock-role-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="nmac-kpi-theme"
      disableTransitionOnChange
    >
      <MockRoleProvider>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </MockRoleProvider>
    </ThemeProvider>
  );
}
