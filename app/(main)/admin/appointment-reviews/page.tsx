"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppointmentReviewDashboard } from "@/components/appointment-review/appointment-review-dashboard";
import { AppointmentReviewDetailModal } from "@/components/appointment-review/appointment-review-detail-modal";
import { AppointmentReviewList } from "@/components/appointment-review/appointment-review-list";
import { MainShell } from "@/components/dashboard/main-shell";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";
import { useSession } from "@/components/auth/session-provider";
import type { AppointmentReviewStats } from "@/lib/appointment-review/analytics";
import type { AppointmentReviewDetail } from "@/lib/appointment-review/display";
import { APPOINTMENT_REVIEWS_SETUP_SQL } from "@/lib/appointment-review/store";
import { isNmacNavHrefAllowed } from "@/lib/auth/role-nmac-nav";

type ReviewPeriod = "all" | "quarter" | "30" | "90";
type Tab = "overview" | "reviews";

type ApiResponse = {
  stats?: AppointmentReviewStats;
  reviews?: AppointmentReviewDetail[];
  error?: string;
  setupRequired?: boolean;
  setupSql?: string;
};

export default function AdminAppointmentReviewsPage() {
  const { user, loading } = useSession();
  const { ready: prefsReady, roleNmacNav } = useDashboardPreferences();
  const [stats, setStats] = useState<AppointmentReviewStats | null>(null);
  const [reviews, setReviews] = useState<AppointmentReviewDetail[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [period, setPeriod] = useState<ReviewPeriod>("all");
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allowed =
    !prefsReady || isNmacNavHrefAllowed(user?.role, "/admin/appointment-reviews", roleNmacNav);

  const selectedIndex = useMemo(
    () => (selectedId ? reviews.findIndex((r) => r.id === selectedId) : -1),
    [reviews, selectedId],
  );
  const selectedReview = selectedIndex >= 0 ? reviews[selectedIndex] : null;

  const periodLabel = useMemo(() => {
    switch (period) {
      case "quarter":
        return "This quarter";
      case "30":
        return "Last 30 days";
      case "90":
        return "Last 90 days";
      default:
        return "All";
    }
  }, [period]);

  const load = useCallback(async (filter: ReviewPeriod, silent = false) => {
    if (!silent) setInitialLoading(true);
    else setRefreshing(true);
    setLoadError(null);
    setSetupRequired(false);

    try {
      const qs = filter === "all" ? "" : filter === "quarter" ? "?range=quarter" : `?days=${filter}`;
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
        setReviews([]);
        return;
      }
      setStats(j.stats ?? null);
      setReviews(j.reviews ?? []);
    } catch {
      setLoadError("Could not load results.");
      setStats(null);
      setReviews([]);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !allowed) return;
    void load(period);
  }, [allowed, load, loading, period]);

  const viewReview = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  if (loading || initialLoading) {
    return (
      <MainShell title="Survey Results" subtitle="Loading">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading results…
        </div>
      </MainShell>
    );
  }

  if (!allowed) {
    return (
      <MainShell title="Survey Results" subtitle="Restricted">
        <p className="text-sm text-muted-foreground">You do not have permission to view survey results.</p>
      </MainShell>
    );
  }

  return (
    <MainShell
      title="Survey Results"
      subtitle="Provider experience survey from /appointment-review"
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
          <div className="flex w-max items-center gap-2">
            {(
              [
                { id: "overview", label: "Overview" },
                { id: "reviews", label: "Survey results" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={
                  "shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition " +
                  (tab === id
                    ? "border-accent bg-nav-active-bg text-nav-active-fg"
                    : "border-border bg-card text-muted-foreground hover:text-foreground")
                }
              >
                {label}
              </button>
            ))}
            <span className="mx-1 hidden h-5 w-px bg-border sm:inline" aria-hidden />
            {(
              [
                { id: "all", label: "All time" },
                { id: "quarter", label: "This quarter" },
                { id: "30", label: "Last 30 days" },
                { id: "90", label: "Last 90 days" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setPeriod(id);
                  setSelectedId(null);
                }}
                className={
                  "shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition " +
                  (period === id
                    ? "border-accent bg-nav-active-bg text-nav-active-fg"
                    : "border-border bg-card text-muted-foreground hover:text-foreground")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load(period, true)}
          disabled={refreshing}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-muted/80 disabled:opacity-50 sm:w-auto"
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

      {tab === "overview" && stats ? (
        <AppointmentReviewDashboard stats={stats} onViewReview={viewReview} />
      ) : null}

      {tab === "reviews" ? (
        <AppointmentReviewList reviews={reviews} onViewReview={viewReview} periodLabel={periodLabel} />
      ) : null}

      {selectedReview ? (
        <AppointmentReviewDetailModal
          review={selectedReview}
          onClose={() => setSelectedId(null)}
          hasPrev={selectedIndex > 0}
          hasNext={selectedIndex < reviews.length - 1}
          onPrev={() => {
            const prev = reviews[selectedIndex - 1];
            if (prev) setSelectedId(prev.id);
          }}
          onNext={() => {
            const next = reviews[selectedIndex + 1];
            if (next) setSelectedId(next.id);
          }}
        />
      ) : null}
    </MainShell>
  );
}
