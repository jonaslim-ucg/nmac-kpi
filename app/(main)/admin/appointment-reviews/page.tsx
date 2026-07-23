"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppointmentReviewDashboard } from "@/components/appointment-review/appointment-review-dashboard";
import { AppointmentReviewDetailModal } from "@/components/appointment-review/appointment-review-detail-modal";
import { AppointmentReviewList } from "@/components/appointment-review/appointment-review-list";
import { QuarterlyDrawSummary } from "@/components/appointment-review/quarterly-draw-summary";
import { MainShell } from "@/components/dashboard/main-shell";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";
import { useSession } from "@/components/auth/session-provider";
import type { AppointmentReviewStats } from "@/lib/appointment-review/analytics";
import type { AppointmentReviewDetail } from "@/lib/appointment-review/display";
import type { AppointmentReviewQuarter } from "@/lib/appointment-review/report";
import { APPOINTMENT_REVIEWS_SETUP_SQL } from "@/lib/appointment-review/store";
import { isNmacNavHrefAllowed } from "@/lib/auth/role-nmac-nav";

type ReviewPeriod = "all" | "quarter" | "30" | "90";
type Tab = "overview" | "reviews";

type ApiResponse = {
  stats?: AppointmentReviewStats;
  reviews?: AppointmentReviewDetail[];
  quarter?: AppointmentReviewQuarter | null;
  currentQuarter?: AppointmentReviewQuarter;
  eligibleEntries?: number | null;
  error?: string;
  setupRequired?: boolean;
  setupSql?: string;
};

function availableQuarters(current: AppointmentReviewQuarter | null): { id: string; label: string }[] {
  if (!current) return [];
  const firstYear = Math.max(2026, current.year - 3);
  const options: { id: string; label: string }[] = [];
  for (let year = current.year; year >= firstYear; year--) {
    const lastQuarter = year === current.year ? current.quarter : 4;
    for (let quarter = lastQuarter; quarter >= 1; quarter--) {
      const id = `${year}-Q${quarter}`;
      options.push({
        id,
        label: `Q${quarter} ${year}${id === current.id ? " (Current)" : ""}`,
      });
    }
  }
  return options;
}

export default function AdminAppointmentReviewsPage() {
  const { user, loading } = useSession();
  const { ready: prefsReady, roleNmacNav } = useDashboardPreferences();
  const [stats, setStats] = useState<AppointmentReviewStats | null>(null);
  const [reviews, setReviews] = useState<AppointmentReviewDetail[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [period, setPeriod] = useState<ReviewPeriod>("quarter");
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const [quarter, setQuarter] = useState<AppointmentReviewQuarter | null>(null);
  const [currentQuarter, setCurrentQuarter] = useState<AppointmentReviewQuarter | null>(null);
  const [eligibleEntries, setEligibleEntries] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allowed =
    !prefsReady || isNmacNavHrefAllowed(user?.role, "/admin/appointment-reviews", roleNmacNav);

  const selectedIndex = useMemo(
    () => (selectedId ? reviews.findIndex((r) => r.id === selectedId) : -1),
    [reviews, selectedId],
  );
  const selectedReview = selectedIndex >= 0 ? reviews[selectedIndex] : null;
  const quarterOptions = useMemo(() => availableQuarters(currentQuarter), [currentQuarter]);

  const periodLabel = useMemo(() => {
    switch (period) {
      case "quarter":
        return quarter?.label ?? "Current quarter";
      case "30":
        return "Last 30 days";
      case "90":
        return "Last 90 days";
      default:
        return "All";
    }
  }, [period, quarter]);

  const load = useCallback(async (
    filter: ReviewPeriod,
    quarterId: string | null,
    silent = false,
  ) => {
    if (!silent) setInitialLoading(true);
    else setRefreshing(true);
    setLoadError(null);
    setSetupRequired(false);

    try {
      const params = new URLSearchParams({ includeTests: "false" });
      if (filter === "quarter") {
        if (quarterId) params.set("quarter", quarterId);
        else params.set("range", "quarter");
      }
      if (filter === "30" || filter === "90") params.set("days", filter);
      const r = await fetch(`/api/admin/appointment-reviews?${params}`, { credentials: "include" });
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
        setQuarter(null);
        setEligibleEntries(null);
        return;
      }
      setStats(j.stats ?? null);
      setReviews(j.reviews ?? []);
      setQuarter(j.quarter ?? null);
      setCurrentQuarter(j.currentQuarter ?? null);
      setEligibleEntries(typeof j.eligibleEntries === "number" ? j.eligibleEntries : null);
    } catch {
      setLoadError("Could not load results.");
      setStats(null);
      setReviews([]);
      setQuarter(null);
      setEligibleEntries(null);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !allowed) return;
    void load(period, selectedQuarter);
  }, [allowed, load, loading, period, selectedQuarter]);

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
                { id: "quarter", label: "Quarterly" },
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
            {period === "quarter" && quarterOptions.length > 0 ? (
              <select
                aria-label="Survey quarter"
                value={selectedQuarter ?? quarter?.id ?? currentQuarter?.id ?? ""}
                onChange={(event) => {
                  setSelectedQuarter(event.target.value);
                  setSelectedId(null);
                }}
                className="h-[34px] rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition focus:border-accent"
              >
                {quarterOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load(period, selectedQuarter, true)}
          disabled={refreshing}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-muted/80 disabled:opacity-50 sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      {period === "quarter" && quarter && eligibleEntries !== null ? (
        <QuarterlyDrawSummary quarter={quarter} eligibleEntries={eligibleEntries} />
      ) : null}

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
