"use client";

import { Search } from "lucide-react";
import type { KpiDefinition } from "@/lib/kpi/types";

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
}: Props) {
  const field =
    "rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
      <label className="flex min-w-[180px] flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">KPI</span>
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
        <span className="text-xs font-medium text-muted-foreground">Year</span>
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
        <span className="text-xs font-medium text-muted-foreground">Week range</span>
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
      <label className="flex min-w-[200px] flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Search</span>
        <span className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search by week (e.g. Week 3)…"
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </span>
      </label>
    </div>
  );
}
