"use client";

import { useSession } from "@/components/auth/session-provider";
import { MainShell } from "@/components/dashboard/main-shell";
import { ThreeCxEmailImportPanel } from "@/components/dev/three-cx-email-import-panel";
import { canAccessDev } from "@/lib/auth/types";

export default function DevThreeCxPage() {
  const { user, loading } = useSession();

  if (loading) {
    return (
      <MainShell title="3CX import" subtitle="Loading">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </MainShell>
    );
  }

  if (!canAccessDev(user?.role)) {
    return (
      <MainShell title="3CX import" subtitle="Restricted">
        <p className="text-sm text-muted-foreground">You need the Developer role to access this page.</p>
      </MainShell>
    );
  }

  return (
    <MainShell title="3CX import" subtitle="Pull scheduled 3CX report emails into NMAC call KPIs">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
          <div className="border-b border-border bg-surface-muted/40 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">3CX email import</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pull the scheduled 3CX report email into the NMAC call KPIs.
            </p>
          </div>
          <div className="px-4 py-4 sm:px-5">
            <ThreeCxEmailImportPanel />
          </div>
        </section>
      </div>
    </MainShell>
  );
}
