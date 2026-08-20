import type {
  ArdtsWorkstreamComparisonRow,
  ArdtsWorkstreamMetric,
  ArdtsWorkstreamTrends,
} from "./types";

export const REFERRAL_WORKSTREAM_COLORS: Record<string, string> = {
  referral: "#4285f4",
  external_diagnostic: "#12b8d6",
  in_house_ultrasound: "#27c794",
};

const FALLBACK_WORKSTREAM_COLORS = ["#8b5cf6", "#f59e0b", "#ef4444", "#64748b"];

export function referralWorkstreamColor(key: string, index = 0): string {
  return REFERRAL_WORKSTREAM_COLORS[key] ??
    FALLBACK_WORKSTREAM_COLORS[index % FALLBACK_WORKSTREAM_COLORS.length]!;
}

export function buildTrackedItemsChartData(trends: ArdtsWorkstreamTrends) {
  return {
    labels: trends.tracked_items_by_month.map((point) => point.month_label),
    totals: trends.tracked_items_by_month.map((point) => point.total),
    datasets: trends.series.map((series, index) => ({
      key: series.key,
      label: series.label,
      color: referralWorkstreamColor(series.key, index),
      data: trends.tracked_items_by_month.map((point) => point.workstreams[series.key] ?? 0),
    })),
  };
}

export function comparisonMetric(
  row: ArdtsWorkstreamComparisonRow,
  columnKey: string,
): ArdtsWorkstreamMetric | null {
  if (columnKey === "total") {
    return { count: row.total, percent: 100, applicable: true };
  }
  return row.metrics[columnKey] ?? null;
}

export function comparisonMetricLabel(metric: ArdtsWorkstreamMetric | null): string {
  if (!metric) return "—";
  if (!metric.applicable) return "N/A";
  return metric.count === null ? "—" : String(metric.count);
}

export function boundedPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
