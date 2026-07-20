"use client";

import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";

type ThreeCxRange = "month" | "day" | "week1" | "week2" | "week3" | "week4" | "week5";

type ThreeCxMetrics = {
  received: number;
  answered: number;
  missed: number;
  answeredRate: number;
};

type ThreeCxReportRow = {
  queue: string;
  extension: string;
  label: string;
  level: "queue" | "extension" | "total";
  received: number | null;
  serviced: number | null;
  unanswered: number | null;
  polls: number | null;
  unansweredLabel: string;
  talkTime: string;
  averageTalkTime: string;
};

type ThreeCxValuesResponse = {
  ok?: boolean;
  error?: string;
  metrics?: ThreeCxMetrics;
  rows?: ThreeCxReportRow[];
};

type ThreeCxMonthAvailability = {
  monthIndex: number;
  hasData: boolean;
  ranges: ThreeCxRange[];
  dailyDates: string[];
};

type ThreeCxAvailabilityResponse = {
  ok?: boolean;
  error?: string;
  months?: ThreeCxMonthAvailability[];
};

type Props = {
  year: number;
  monthIndex: number;
  onMonthSelect: (monthIndex: number) => void;
};

const RANGE_FILTERS: { value: ThreeCxRange; label: string }[] = [
  { value: "month", label: "Whole month" },
  { value: "day", label: "Daily" },
  { value: "week1", label: "1st week" },
  { value: "week2", label: "2nd week" },
  { value: "week3", label: "3rd week" },
  { value: "week4", label: "4th week" },
  { value: "week5", label: "5th week" },
];

function dateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthBounds(year: number, monthIndex: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return {
    lastDay,
    startDate: dateKey(year, monthIndex, 1),
    endDate: dateKey(year, monthIndex, lastDay),
  };
}

function defaultReportDate(year: number, monthIndex: number) {
  const today = new Date();
  const isSelectedMonth = today.getFullYear() === year && today.getMonth() === monthIndex;
  return dateKey(year, monthIndex, isSelectedMonth ? today.getDate() : 1);
}

function dayFromDateKey(value: string, year: number, monthIndex: number) {
  const [rawYear, rawMonth, rawDay] = value.split("-").map(Number);
  if (rawYear !== year || rawMonth !== monthIndex + 1 || !Number.isInteger(rawDay)) return null;
  const { lastDay } = monthBounds(year, monthIndex);
  return rawDay >= 1 && rawDay <= lastDay ? rawDay : null;
}

function formatDailyDateLabel(value: string) {
  const [rawYear, rawMonth, rawDay] = value.split("-").map(Number);
  if (!rawYear || !rawMonth || !rawDay) return value;
  return `${MONTHS[rawMonth - 1] ?? String(rawMonth).padStart(2, "0")} ${rawDay}, ${rawYear}`;
}

function formatDailyDateChip(value: string) {
  const [rawYear, rawMonth, rawDay] = value.split("-").map(Number);
  if (!rawYear || !rawMonth || !rawDay) return value;
  return `${MONTHS[rawMonth - 1] ?? String(rawMonth).padStart(2, "0")} ${rawDay}`;
}

function formatCount(value: number | null | undefined) {
  return value === null || value === undefined ? "" : value.toLocaleString();
}

function queueKey(row: ThreeCxReportRow) {
  return row.queue || row.label;
}

function queueHasChildren(rows: ThreeCxReportRow[], index: number) {
  const row = rows[index];
  if (!row || row.level !== "queue") return false;
  return rows[index + 1]?.level === "extension";
}

function visibleReportRows(rows: ThreeCxReportRow[], expandedQueues: Set<string>) {
  let activeQueue = "";
  return rows.filter((row) => {
    if (row.level === "queue") {
      activeQueue = queueKey(row);
      return true;
    }
    if (row.level === "extension") {
      return expandedQueues.has(activeQueue);
    }
    return true;
  });
}

function timeHasData(value: string) {
  const clean = value.trim();
  return clean !== "" && clean !== "00:00:00" && clean !== "0:00:00";
}

function rowHasData(row: ThreeCxReportRow) {
  return (
    (row.received ?? 0) > 0 ||
    (row.serviced ?? 0) > 0 ||
    (row.unanswered ?? 0) > 0 ||
    (row.polls ?? 0) > 0 ||
    timeHasData(row.talkTime) ||
    timeHasData(row.averageTalkTime)
  );
}

function dataOnlyReportRows(rows: ThreeCxReportRow[]) {
  const out: ThreeCxReportRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    if (row.level === "queue") {
      const childRows: ThreeCxReportRow[] = [];
      let childIndex = index + 1;
      while (rows[childIndex]?.level === "extension") {
        const child = rows[childIndex];
        if (child && rowHasData(child)) childRows.push(child);
        childIndex += 1;
      }
      if (rowHasData(row) || childRows.length > 0) out.push(row, ...childRows);
      index = childIndex - 1;
      continue;
    }
    if (rowHasData(row)) out.push(row);
  }
  return out;
}

function fallbackReportRows(metrics: ThreeCxMetrics | null): ThreeCxReportRow[] {
  if (!metrics) return [];
  return [
    {
      queue: "Totals",
      extension: "",
      label: "Totals",
      level: "total",
      received: metrics.received,
      serviced: metrics.answered,
      unanswered: metrics.missed,
      polls: null,
      unansweredLabel: String(metrics.missed),
      talkTime: "00:00:00",
      averageTalkTime: "00:00:00",
    },
  ];
}

export function ThreeCxQueuePerformancePanel({ year, monthIndex, onMonthSelect }: Props) {
  const [range, setRange] = useState<ThreeCxRange>("month");
  const [dailyDate, setDailyDate] = useState(() => defaultReportDate(year, monthIndex));
  const [availability, setAvailability] = useState<ThreeCxMonthAvailability[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ThreeCxMetrics | null>(null);
  const [rows, setRows] = useState<ThreeCxReportRow[]>([]);
  const [expandedQueues, setExpandedQueues] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availabilityReloadKey, setAvailabilityReloadKey] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const visibleMonthIndexes = useMemo(
    () => availability.filter((month) => month.hasData).map((month) => month.monthIndex),
    [availability],
  );
  const selectedAvailability = useMemo(
    () => availability.find((month) => month.monthIndex === monthIndex) ?? null,
    [availability, monthIndex],
  );
  const availableFilters = useMemo(
    () => RANGE_FILTERS.filter((filter) => selectedAvailability?.ranges.includes(filter.value)),
    [selectedAvailability],
  );
  const effectiveRange = selectedAvailability?.ranges.includes(range) ? range : (availableFilters[0]?.value ?? range);
  const effectiveDailyDate =
    effectiveRange === "day" &&
    selectedAvailability?.dailyDates.length &&
    !selectedAvailability.dailyDates.includes(dailyDate)
      ? selectedAvailability.dailyDates[0]!
      : dailyDate;
  const dailyDates = selectedAvailability?.dailyDates ?? [];
  const displayPeriod = effectiveRange === "day" ? formatDailyDateLabel(effectiveDailyDate) : `${MONTHS[monthIndex]} ${year}`;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAvailabilityLoading(true);
      setAvailabilityError(null);
      try {
        const params = new URLSearchParams({ year: String(year) });
        const res = await fetch(`/api/integrations/3cx/availability?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await res.json()) as ThreeCxAvailabilityResponse;
        if (!res.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not load available 3CX queue data.");
        }
        if (!cancelled) setAvailability(payload.months ?? []);
      } catch (err) {
        if (!cancelled) {
          setAvailability([]);
          setAvailabilityError(err instanceof Error ? err.message : "Could not load available 3CX queue data.");
        }
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [availabilityReloadKey, year]);

  useEffect(() => {
    if (availabilityLoading || visibleMonthIndexes.length === 0) return;
    if (!visibleMonthIndexes.includes(monthIndex)) {
      onMonthSelect(visibleMonthIndexes[0]!);
    }
  }, [availabilityLoading, monthIndex, onMonthSelect, visibleMonthIndexes]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (availabilityLoading) {
        setLoading(true);
        return;
      }
      if (!selectedAvailability?.hasData || !selectedAvailability.ranges.includes(effectiveRange)) {
        setMetrics(null);
        setRows([]);
        setExpandedQueues(new Set());
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        year: String(year),
        monthIndex: String(monthIndex),
        range: effectiveRange,
      });

      if (effectiveRange === "day") {
        const day = dayFromDateKey(effectiveDailyDate, year, monthIndex);
        if (day === null) {
          if (!cancelled) {
            setMetrics(null);
            setRows([]);
            setExpandedQueues(new Set());
            setError("Choose a valid report date.");
            setLoading(false);
          }
          return;
        }
        params.set("day", String(day));
      }

      try {
        const res = await fetch(`/api/integrations/3cx/values?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await res.json()) as ThreeCxValuesResponse;
        if (!res.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not load 3CX queue performance.");
        }
        if (!cancelled) {
          setMetrics(payload.metrics ?? null);
          setRows(payload.rows ?? []);
          setExpandedQueues(new Set());
        }
      } catch (err) {
        if (!cancelled) {
          setMetrics(null);
          setRows([]);
          setExpandedQueues(new Set());
          setError(err instanceof Error ? err.message : "Could not load 3CX queue performance.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [availabilityLoading, effectiveDailyDate, effectiveRange, monthIndex, reloadKey, selectedAvailability, year]);

  const tableRows = useMemo(() => dataOnlyReportRows(rows.length > 0 ? rows : fallbackReportRows(metrics)), [metrics, rows]);
  const displayedRows = useMemo(() => visibleReportRows(tableRows, expandedQueues), [expandedQueues, tableRows]);

  const answerRate = metrics ? `${metrics.answeredRate}%` : "–";

  return (
    <div className="flex flex-col gap-4">
      {availabilityLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading available 3CX months...
        </div>
      ) : availabilityError ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          {availabilityError}
        </p>
      ) : visibleMonthIndexes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
          No saved 3CX queue data for {year}.
        </p>
      ) : (
        <div className="nk26-tabs mb-0">
          {visibleMonthIndexes.map((index) => (
            <button
              key={MONTHS[index]}
              type="button"
              onClick={() => onMonthSelect(index)}
              disabled={availabilityLoading}
              className={"nk26-tab disabled:cursor-not-allowed disabled:opacity-50" + (monthIndex === index ? " nk26-tab-active" : "")}
            >
              {MONTHS[index]}
            </button>
          ))}
        </div>
      )}

      {visibleMonthIndexes.length > 0 ? <div className="threecx-filter-row flex flex-wrap items-center gap-2">
        {availableFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setRange(filter.value)}
            disabled={loading || availabilityLoading}
            className={
              "min-h-[30px] rounded-md px-2.5 text-xs font-semibold transition disabled:opacity-50 " +
              (effectiveRange === filter.value
                ? "bg-accent-muted text-foreground ring-1 ring-border"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")
            }
          >
            {filter.label}
          </button>
        ))}
        {effectiveRange === "day" ? (
          <div className="threecx-date-strip">
            <span className="threecx-date-label">Date</span>
            <div className="threecx-date-chip-list" aria-label="Daily report dates">
              {dailyDates.map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => setDailyDate(date)}
                  disabled={availabilityLoading}
                  className={"threecx-date-chip" + (effectiveDailyDate === date ? " threecx-date-chip-active" : "")}
                >
                  {formatDailyDateChip(date)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div> : null}

      {visibleMonthIndexes.length > 0 ? <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Received", metrics?.received.toLocaleString() ?? "–"],
          ["Serviced", metrics?.answered.toLocaleString() ?? "–"],
          ["Unanswered", metrics?.missed.toLocaleString() ?? "–"],
          ["Answer rate", answerRate],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
          </div>
        ))}
      </div> : null}

      {visibleMonthIndexes.length > 0 ? <div className="overflow-hidden rounded-lg border border-border bg-background/60 shadow-sm">
        <div className="border-b border-border bg-muted/40 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Queue Performance Overview</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {displayPeriod}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex min-h-[34px] items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent-muted/40 disabled:opacity-50"
              onClick={() => {
                setAvailabilityReloadKey((value) => value + 1);
                setReloadKey((value) => value + 1);
              }}
              disabled={loading || availabilityLoading}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
              Refresh
            </button>
          </div>
        </div>
        {error ? (
          <p className="px-4 py-4 text-xs text-red-700 dark:text-red-300">{error}</p>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading queue performance...
          </div>
        ) : tableRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No queue rows with activity for this range.
          </p>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
                  <th className="w-[36%] px-4 py-2">Queue</th>
                  <th className="px-4 py-2 text-right">Received</th>
                  <th className="px-4 py-2 text-right">Serviced</th>
                  <th className="px-4 py-2 text-right">Unanswered</th>
                  <th className="px-4 py-2 text-right">Talk Time</th>
                  <th className="px-4 py-2 text-right">Average Talk Time</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row, index) => {
                  const child = row.level === "extension";
                  const total = row.level === "total";
                  const rowIndex = tableRows.indexOf(row);
                  const hasChildren = queueHasChildren(tableRows, rowIndex);
                  const expanded = expandedQueues.has(queueKey(row));
                  return (
                    <tr
                      key={`${row.label}-${index}`}
                      className={
                        "border-b border-border transition-colors hover:bg-accent-muted/30 " +
                        (total ? "bg-muted/40 font-semibold" : child ? "bg-background/70" : "bg-card")
                      }
                    >
                      <td className="px-4 py-2">
                        <div className={"flex items-center gap-2 " + (child ? "pl-6" : "")}>
                          {child || total ? (
                            <span className="h-4 w-4 shrink-0" />
                          ) : hasChildren ? (
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
                              aria-label={expanded ? `Collapse ${row.label}` : `Expand ${row.label}`}
                              onClick={() => {
                                const key = queueKey(row);
                                setExpandedQueues((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" aria-hidden />
                              ) : (
                                <ChevronRight className="h-4 w-4" aria-hidden />
                              )}
                            </button>
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          )}
                          <span className={child ? "text-foreground/90" : "text-foreground"}>{row.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-foreground">{formatCount(row.received)}</td>
                      <td className="px-4 py-2 text-right text-foreground">{formatCount(row.serviced)}</td>
                      <td className="px-4 py-2 text-right text-foreground">{row.unansweredLabel}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {child ? row.talkTime : ""}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {child ? row.averageTalkTime : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div> : null}
    </div>
  );
}
