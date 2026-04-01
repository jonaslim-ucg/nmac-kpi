"use client";

import type { KpiDefinition, WeeklyRow } from "@/lib/kpi/types";
import { formatKpiValue } from "@/lib/kpi/data-source";
import { formatWeekLabel } from "@/lib/kpi/week-label";

function unitCaption(unit: KpiDefinition["unit"]): string {
  switch (unit) {
    case "count":
      return "Numbers shown are totals for each week.";
    case "percent":
      return "Numbers shown are percentages for each week.";
    case "minutes":
      return "Numbers shown are time values for each week (see KPI name for units).";
    case "score":
      return "Numbers shown are scores for each week.";
    default:
      return "";
  }
}

function weekRangeText(rows: WeeklyRow[]): string {
  if (rows.length === 0) return "No weeks loaded for this year yet.";
  const sorted = [...rows].sort((a, b) => a.weekIndex - b.weekIndex);
  const first = sorted[0].weekIndex;
  const last = sorted[sorted.length - 1].weekIndex;
  if (first === last) return formatWeekLabel(first);
  return `${formatWeekLabel(first)}–${formatWeekLabel(last)} (${sorted.length} weeks)`;
}

type Props = {
  kpi: KpiDefinition;
  year: number;
  /** All weeks loaded for this KPI/year (before filters) */
  allWeeks: WeeklyRow[];
  /** Weeks currently shown after filters */
  filteredCount: number;
};

export function DashboardKpiInfo({ kpi, year, allWeeks, filteredCount }: Props) {
  const suffix = kpi.suffix || (kpi.unit === "percent" ? "%" : "");
  const targetDisplay = `${formatKpiValue(kpi.target, kpi.unit)}${suffix}`;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{kpi.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reporting year <span className="font-medium text-foreground">{year}</span>
              {" · "}
              Target <span className="font-medium text-foreground">{targetDisplay}</span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{unitCaption(kpi.unit)}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-border/80 bg-background/50 px-3 py-2">
              <dt className="text-xs font-medium text-muted-foreground">Weeks on file</dt>
              <dd className="mt-0.5 text-foreground">{weekRangeText(allWeeks)}</dd>
            </div>
            <div className="rounded-lg border border-border/80 bg-background/50 px-3 py-2">
              <dt className="text-xs font-medium text-muted-foreground">Table / chart</dt>
              <dd className="mt-0.5 text-foreground">
                {filteredCount === 0
                  ? "No rows match your filters."
                  : `Showing ${filteredCount} week${filteredCount === 1 ? "" : "s"} (after search & week range).`}
              </dd>
            </div>
          </dl>
        </div>
        <div className="shrink-0 rounded-lg border border-border/80 bg-background/50 px-3 py-2 text-xs text-muted-foreground lg:max-w-xs">
          <p className="font-medium text-foreground">Chart legend</p>
          <ul className="mt-2 space-y-1.5">
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-6 rounded-sm bg-blue-500" aria-hidden />
              <span>This year</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-6 rounded-sm bg-slate-400 dark:bg-slate-500" aria-hidden />
              <span>Last year</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-0.5 w-6 border-t-2 border-dashed border-violet-500 bg-transparent" aria-hidden />
              <span>Target</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
