"use client";

import { Search } from "lucide-react";
import type { KpiDefinition } from "@/lib/kpi/types";

import type { RateColumnMode } from "@/lib/kpi/rate";

type Props = {
  kpis: KpiDefinition[];
  selectedSlug: string;
  onKpiChange: (slug: string) => void;
  year: number;
  onYearChange: (y: number) => void;
  weekPreset: string;
  onWeekPresetChange: (p: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  rateColumn: RateColumnMode;
  onRateColumnChange: (mode: RateColumnMode) => void;
  allowTargetRate: boolean;
  allowVsLastYear: boolean;
};

export function KpiFilters({
  kpis,
  selectedSlug,
  onKpiChange,
  year,
  onYearChange,
  weekPreset,
  onWeekPresetChange,
  search,
  onSearchChange,
  rateColumn,
  onRateColumnChange,
  allowTargetRate,
  allowVsLastYear,
}: Props) {
  const field =
    "rounded-lg border border-border bg-surface-muted/60 px-3 py-2 text-sm text-foreground shadow-inner outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30 dark:bg-surface-muted/40";

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">KPI</span>
        <select
          className={field}
          value={selectedSlug}
          onChange={(e) => onKpiChange(e.target.value)}
        >
          {kpis.map((k) => (
            <option key={k.slug} value={k.slug}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex w-28 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Year</span>
        <select
          className={field}
          value={String(year)}
          onChange={(e) => onYearChange(Number(e.target.value))}
        >
          {[2026, 2025, 2024].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[140px] flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Week range</span>
        <select
          className={field}
          value={weekPreset}
          onChange={(e) => onWeekPresetChange(e.target.value)}
        >
          <option value="all">All loaded weeks</option>
          <option value="4">Last 4 weeks</option>
          <option value="8">Last 8 weeks</option>
        </select>
      </label>
      <label className="flex min-w-[180px] flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rate column</span>
        <select
          className={field}
          value={rateColumn}
          onChange={(e) => onRateColumnChange(e.target.value as RateColumnMode)}
          title="Options depend on the KPI target and whether last-year data exists for the weeks you filtered."
        >
          <option value="none">Hidden</option>
          <option value="target_pct" disabled={!allowTargetRate}>
            Target %
          </option>
          <option value="vs_last_year" disabled={!allowVsLastYear}>
            vs last year
          </option>
        </select>
      </label>
      <label className="flex min-w-[200px] flex-1 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Search</span>
        <span className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search by week (e.g. Week 3)…"
            className="w-full rounded-lg border border-border bg-surface-muted/60 py-2 pl-9 pr-3 text-sm text-foreground shadow-inner outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30 dark:bg-surface-muted/40"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </span>
      </label>
      </div>
    </div>
  );
}
