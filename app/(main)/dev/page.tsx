"use client";

import { useSession } from "@/components/auth/session-provider";
import { MaintenanceModePanel } from "@/components/dev/maintenance-mode-panel";
import { MainShell } from "@/components/dashboard/main-shell";
import { canAccessDev } from "@/lib/auth/types";

export default function DevPage() {
  const { user, loading } = useSession();

  if (loading) {
    return (
      <MainShell title="Developer" subtitle="Loading">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </MainShell>
    );
  }

  if (!canAccessDev(user?.role)) {
    return (
      <MainShell title="Developer" subtitle="Restricted">
        <p className="text-sm text-muted-foreground">You need the Developer role to access this page.</p>
      </MainShell>
    );
  }

  return (
    <MainShell title="Developer" subtitle="Tools for developers">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
          <div className="border-b border-border bg-surface-muted/40 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Maintenance mode</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Block access for everyone except administrators and developers.
            </p>
          </div>
          <div className="px-4 py-4 sm:px-5">
            <MaintenanceModePanel />
          </div>
        </section>
      </div>
    </MainShell>
  );
}
