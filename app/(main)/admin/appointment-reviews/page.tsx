"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppointmentReviewDashboard } from "@/components/appointment-review/appointment-review-dashboard";
import { MainShell } from "@/components/dashboard/main-shell";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";
import { useSession } from "@/components/auth/session-provider";
import type { AppointmentReviewStats } from "@/lib/appointment-review/analytics";
import { APPOINTMENT_REVIEWS_SETUP_SQL } from "@/lib/appointment-review/store";
import { canEditKpiData } from "@/lib/auth/types";

type FilterDays = "all" | "30" | "90";

type ApiResponse = {
  stats?: AppointmentReviewStats;
  error?: string;
  setupRequired?: boolean;
  setupSql?: string;
};

export default function AdminAppointmentReviewsPage() {
  const { user, loading } = useSession();
  const { customRoles } = useDashboardPreferences();
  const [stats, setStats] = useState<AppointmentReviewStats | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [days, setDays] = useState<FilterDays>("all");

  const allowed = canEditKpiData(user?.role, customRoles);

  const load = useCallback(async (filter: FilterDays, silent = false) => {
    if (!silent) setInitialLoading(true);
    else setRefreshing(true);
    setLoadError(null);
    setSetupRequired(false);

    try {
      const qs = filter === "all" ? "" : `?days=${filter}`;
      const r = await fetch(`/api/admin/appointment-reviews${qs}`, { credentials: "include" });
      const j = (await r.json()) as ApiResponse;
      if (!r.ok) {
        if (j.setupRequired) {
          setSetupRequired(true);
          setLoadError(j.error ?? "Database setup required.");
        } else {
          setLoadError(j.error ?? "Could not load results.");
        }
        setStats(null);
        return;
      }
      setStats(j.stats ?? null);
    } catch {
      setLoadError("Could not load results.");
      setStats(null);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !allowed) return;
    void load(days);
  }, [allowed, days, load, loading]);

  if (loading || initialLoading) {
    return (
      <MainShell title="Appointment reviews" subtitle="Loading">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading results…
        </div>
      </MainShell>
    );
  }

  if (!allowed) {
    return (
      <MainShell title="Appointment reviews" subtitle="Restricted">
        <p className="text-sm text-muted-foreground">You do not have permission to view appointment review results.</p>
      </MainShell>
    );
  }

  return (
    <MainShell
      title="Appointment reviews"
      subtitle="Patient questionnaire results from /appointment-review"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "all", label: "All time" },
              { id: "30", label: "Last 30 days" },
              { id: "90", label: "Last 90 days" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setDays(id)}
              className={
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition " +
                (days === id
                  ? "border-accent bg-nav-active-bg text-nav-active-fg"
                  : "border-border bg-card text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load(days, true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-muted/80 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      {loadError ? (
        <div className="dashboard-card mb-6 p-5">
          <span className="dashboard-card-accent" aria-hidden />
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{loadError}</p>
          {setupRequired ? (
            <pre className="mt-4 max-h-48 overflow-auto rounded-lg border border-border bg-surface-muted/50 p-3 font-mono text-xs text-foreground">
              {APPOINTMENT_REVIEWS_SETUP_SQL}
            </pre>
          ) : null}
        </div>
      ) : null}

      {stats ? <AppointmentReviewDashboard stats={stats} /> : null}
    </MainShell>
  );
}
