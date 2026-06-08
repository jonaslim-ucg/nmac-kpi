import type { ChartConfiguration } from "chart.js";
import {
  barBase,
  emphasizeSelectedMonthBarColors,
  resolveNk26ChartTheme,
  resolveNk26CssColor,
} from "@/lib/kpi-nmac-2026/chart-config";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";
import { REFERRAL_STATUS_CARDS } from "@/lib/ardts/referral-display";
import type { ReferralMonthlyPoint } from "@/lib/ardts/referral-metrics";
import type { ArdtsStatusCountsResponse } from "@/lib/ardts/types";

const STATUS_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#a78bfa",
  "#06b6d4",
  "#ec4899",
  "#64748b",
];

function monthTotals(months: ReferralMonthlyPoint[], pick: (m: ReferralMonthlyPoint) => number): number[] {
  const byIndex = new Map(months.map((m) => [m.monthIndex, m]));
  return MONTHS.map((_, i) => pick(byIndex.get(i) ?? { monthIndex: i, total: 0, booked: 0, booking_pending: 0, need_help: 0, completed: 0, closed: 0, from: "", to: "" }));
}

export function referralSentMonthlyChart(
  months: ReferralMonthlyPoint[],
  highlightMonth?: number,
): ChartConfiguration {
  const theme = resolveNk26ChartTheme();
  const accent = resolveNk26CssColor("--chart-this-year", "#2563eb");
  const totals = monthTotals(months, (m) => m.total);
  const colors = emphasizeSelectedMonthBarColors(
    totals.map(() => accent),
    highlightMonth ?? -1,
  );

  return barBase(MONTHS, [{ label: "Referrals sent", data: totals, backgroundColor: colors }], undefined, theme, highlightMonth);
}

export function referralOutcomeMonthlyChart(
  months: ReferralMonthlyPoint[],
  highlightMonth?: number,
): ChartConfiguration {
  const theme = resolveNk26ChartTheme();
  const booked = monthTotals(months, (m) => m.booked);
  const backlog = monthTotals(months, (m) => m.booking_pending + m.need_help);

  return barBase(
    MONTHS,
    [
      {
        label: "Booked",
        data: booked,
        backgroundColor: emphasizeSelectedMonthBarColors(booked.map(() => "#22c55e"), highlightMonth ?? -1),
      },
      {
        label: "Needs action",
        data: backlog,
        backgroundColor: emphasizeSelectedMonthBarColors(backlog.map(() => "#f59e0b"), highlightMonth ?? -1),
      },
    ],
    undefined,
    theme,
    highlightMonth,
  );
}

export function referralStatusBreakdownChart(data: ArdtsStatusCountsResponse): ChartConfiguration {
  const theme = resolveNk26ChartTheme();
  const cards = REFERRAL_STATUS_CARDS.filter((c) => c.key !== "total");
  const labels = cards.map((c) => c.label);
  const values = cards.map((c) => data.counts[c.key as keyof typeof data.counts] ?? 0);
  const colors = cards.map((_, i) => STATUS_COLORS[i % STATUS_COLORS.length]!);

  const config = barBase(labels, [{ label: "Count", data: values, backgroundColor: colors }], undefined, theme);
  return {
    ...config,
    options: {
      ...config.options,
      indexAxis: "y",
      plugins: {
        ...config.options?.plugins,
        legend: { display: false },
      },
    },
  };
}
