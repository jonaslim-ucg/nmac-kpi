"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type ReviewPeriod = "all" | "quarter" | "30" | "90" | "custom";
type Tab = "overview" | "reviews";

type CustomDateRange = {
  start: string;
  end: string;
};

type ApiResponse = {
  stats?: AppointmentReviewStats;
  reviews?: AppointmentReviewDetail[];
  numberSent?: number;
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

function formatCalendarDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

export default function AdminAppointmentReviewsPage() {
  const { user, loading } = useSession();
  const { ready: prefsReady, roleNmacNav } = useDashboardPreferences();
  const [stats, setStats] = useState<AppointmentReviewStats | null>(null);
  const [reviews, setReviews] = useState<AppointmentReviewDetail[]>([]);
  const [numberSent, setNumberSent] = useState(0);
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
  const [showTestResponses, setShowTestResponses] = useState(false);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [customDateStart, setCustomDateStart] = useState("");
  const [customDateEnd, setCustomDateEnd] = useState("");
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const hasLoaded = useRef(false);
  const latestLoadRequest = useRef(0);

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
      case "custom":
        return customRange
          ? `${formatCalendarDate(customRange.start)} – ${formatCalendarDate(customRange.end)}`
          : "Custom dates";
      default:
        return "All";
    }
  }, [customRange, period, quarter]);

  const load = useCallback(async (
    filter: ReviewPeriod,
    quarterId: string | null,
    customDateRange: CustomDateRange | null,
    includeTestResponses: boolean,
    silent = false,
  ) => {
    const requestId = latestLoadRequest.current + 1;
    latestLoadRequest.current = requestId;
    if (!silent) setInitialLoading(true);
    else setRefreshing(true);
    setLoadError(null);
    setSetupRequired(false);

    try {
      const params = new URLSearchParams();
      if (filter === "quarter") {
        if (quarterId) params.set("quarter", quarterId);
        else params.set("range", "quarter");
      }
      if (filter === "30" || filter === "90") params.set("days", filter);
      if (filter === "custom" && customDateRange) {
        params.set("dateStart", customDateRange.start);
        params.set("dateEnd", customDateRange.end);
      }

      const liveParams = new URLSearchParams(params);
      liveParams.set("includeTests", "false");
      const testParams = new URLSearchParams(params);
      testParams.set("includeTests", "true");
      const [liveResponse, inclusiveResponse] = await Promise.all([
        fetch(`/api/admin/appointment-reviews?${liveParams}`, { credentials: "include" }),
        includeTestResponses
          ? fetch(`/api/admin/appointment-reviews?${testParams}`, { credentials: "include" })
          : Promise.resolve(null),
      ]);
      const liveData = (await liveResponse.json()) as ApiResponse;
      if (requestId !== latestLoadRequest.current) return;
      if (!liveResponse.ok) {
        if (liveData.setupRequired) {
          setSetupRequired(true);
          setLoadError(liveData.error ?? "Database setup required.");
        } else {
          setLoadError(liveData.error ?? "Could not load results.");
        }
        setStats(null);
        setReviews([]);
        setNumberSent(0);
        setQuarter(null);
        setEligibleEntries(null);
        return;
      }

      let displayedReviews = liveData.reviews ?? [];
      if (inclusiveResponse) {
        const inclusiveData = (await inclusiveResponse.json()) as ApiResponse;
        if (requestId !== latestLoadRequest.current) return;
        if (!inclusiveResponse.ok) {
          setLoadError(inclusiveData.error ?? "Could not load test responses.");
        } else {
          displayedReviews = inclusiveData.reviews ?? displayedReviews;
        }
      }

      setStats(liveData.stats ?? null);
      setReviews(displayedReviews);
      setNumberSent(typeof liveData.numberSent === "number" ? liveData.numberSent : 0);
      setQuarter(liveData.quarter ?? null);
      setCurrentQuarter(liveData.currentQuarter ?? null);
      setEligibleEntries(
        typeof liveData.eligibleEntries === "number" ? liveData.eligibleEntries : null,
      );
    } catch {
      if (requestId !== latestLoadRequest.current) return;
      setLoadError("Could not load results.");
      setStats(null);
      setReviews([]);
      setNumberSent(0);
      setQuarter(null);
      setEligibleEntries(null);
    } finally {
      if (requestId !== latestLoadRequest.current) return;
      hasLoaded.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !allowed) return;
    void load(period, selectedQuarter, customRange, showTestResponses, hasLoaded.current);
  }, [allowed, customRange, load, loading, period, selectedQuarter, showTestResponses]);

  const applyCustomRange = useCallback(() => {
    if (!customDateStart || !customDateEnd) {
      setCustomRangeError("Choose both a start date and an end date.");
      return;
    }
    if (customDateStart > customDateEnd) {
      setCustomRangeError("The start date must be on or before the end date.");
      return;
    }
    setCustomRangeError(null);
    setCustomRange({ start: customDateStart, end: customDateEnd });
    setPeriod("custom");
    setSelectedId(null);
  }, [customDateEnd, customDateStart]);

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
                  setCustomRangeOpen(false);
                  setCustomRangeError(null);
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
            <button
              type="button"
              onClick={() => {
                setCustomRangeOpen(true);
                setCustomRangeError(null);
              }}
              className={
                "shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition " +
                (period === "custom" || customRangeOpen
                  ? "border-accent bg-nav-active-bg text-nav-active-fg"
                  : "border-border bg-card text-muted-foreground hover:text-foreground")
              }
            >
              Custom dates
            </button>
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
          onClick={() => void load(period, selectedQuarter, customRange, showTestResponses, true)}
          disabled={refreshing}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-surface-muted/80 disabled:opacity-50 sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      {customRangeOpen || period === "custom" ? (
        <div className="dashboard-card mb-6 p-4 sm:p-5">
          <span className="dashboard-card-accent" aria-hidden />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Custom date range</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Includes survey responses submitted on both selected dates.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                Start date
                <input
                  type="date"
                  value={customDateStart}
                  onChange={(event) => {
                    setCustomDateStart(event.target.value);
                    setCustomRangeError(null);
                  }}
                  className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                End date
                <input
                  type="date"
                  value={customDateEnd}
                  min={customDateStart || undefined}
                  onChange={(event) => {
                    setCustomDateEnd(event.target.value);
                    setCustomRangeError(null);
                  }}
                  className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-accent"
                />
              </label>
              <button
                type="button"
                onClick={applyCustomRange}
                disabled={refreshing}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                Apply dates
              </button>
              {period !== "custom" ? (
                <button
                  type="button"
                  onClick={() => {
                    setCustomRangeOpen(false);
                    setCustomRangeError(null);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-surface-muted/80"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
          {customRangeError ? (
            <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
              {customRangeError}
            </p>
          ) : null}
        </div>
      ) : null}

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
        <AppointmentReviewDashboard
          stats={stats}
          numberSent={numberSent}
          onViewReview={viewReview}
        />
      ) : null}

      {tab === "reviews" ? (
        <AppointmentReviewList
          reviews={reviews}
          onViewReview={viewReview}
          periodLabel={periodLabel}
          showTestResponses={showTestResponses}
          testResponsesLoading={refreshing}
          onShowTestResponsesChange={(show) => {
            setSelectedId(null);
            setShowTestResponses(show);
          }}
        />
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
