import type { KpiDefinition, WeeklyRow } from "@/lib/kpi/types";

export type RateColumnMode = "none" | "target_pct" | "vs_last_year";

/** Target % only applies when the KPI has a non-zero target. */
export function isTargetRateAppropriate(kpi: KpiDefinition | undefined): boolean {
  if (!kpi) return false;
  return kpi.target !== 0;
}

/** vs last year only applies when the current row set includes any prior-year value. */
export function isVsLastYearRateAppropriate(rows: WeeklyRow[]): boolean {
  return rows.some((r) => r.lastYear !== null);
}

/** This year as % of KPI target (100% = on target). */
export function rateVsTargetPct(thisYear: number | null, target: number): string {
  if (thisYear === null || target === 0) return "—";
  const pct = (thisYear / target) * 100;
  return pct % 1 === 0 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
}

/** Percent change vs the same period last year (numeric); null if not computable. */
export function yoyDeltaNumeric(thisYear: number | null, lastYear: number | null): number | null {
  if (thisYear === null || lastYear === null || lastYear === 0) return null;
  return ((thisYear - lastYear) / lastYear) * 100;
}

/** Percent change vs the same week last year. */
export function rateVsLastYearPct(thisYear: number | null, lastYear: number | null): string {
  const pct = yoyDeltaNumeric(thisYear, lastYear);
  if (pct === null) return "—";
  const s = pct % 1 === 0 ? String(Math.round(pct)) : pct.toFixed(1);
  return `${pct > 0 ? "+" : ""}${s}%`;
}

export function formatRateCell(
  mode: RateColumnMode,
  kpi: KpiDefinition,
  row: WeeklyRow,
): string {
  if (mode === "none") return "";
  if (mode === "target_pct") return rateVsTargetPct(row.thisYear, kpi.target);
  return rateVsLastYearPct(row.thisYear, row.lastYear);
}

export function rateColumnHeader(mode: RateColumnMode): string | null {
  if (mode === "none") return null;
  if (mode === "target_pct") return "Target %";
  return "vs last year";
}
