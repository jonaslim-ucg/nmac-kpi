import assert from "node:assert/strict";
import test from "node:test";
import {
  boundedPercent,
  buildTrackedItemsChartData,
  comparisonMetric,
  comparisonMetricLabel,
  nearestTrackedMonthIndex,
} from "../../lib/ardts/referral-workstreams.ts";
import type {
  ArdtsWorkstreamComparisonRow,
  ArdtsWorkstreamTrends,
} from "../../lib/ardts/types.ts";

test("tracked-item chart data preserves server series and month ordering", () => {
  const trends: ArdtsWorkstreamTrends = {
    series: [
      { key: "external_diagnostic", label: "External Diagnostics" },
      { key: "referral", label: "Referrals" },
    ],
    tracked_items_by_month: [
      {
        month: 1,
        month_label: "Jan",
        period_from: "2026-01-01",
        period_to: "2026-01-31",
        total: 3,
        workstreams: { referral: 2, external_diagnostic: 1 },
      },
      {
        month: 2,
        month_label: "Feb",
        period_from: "2026-02-01",
        period_to: "2026-02-28",
        total: 0,
        workstreams: { referral: 0, external_diagnostic: 0 },
      },
    ],
    needs_booking_rate: [],
  };

  const result = buildTrackedItemsChartData(trends);
  assert.deepEqual(result.labels, ["Jan", "Feb"]);
  assert.deepEqual(result.totals, [3, 0]);
  assert.deepEqual(
    result.datasets.map(({ key, label, data }) => ({ key, label, data })),
    [
      { key: "external_diagnostic", label: "External Diagnostics", data: [1, 0] },
      { key: "referral", label: "Referrals", data: [2, 0] },
    ],
  );
});

test("comparison cells distinguish totals, not-applicable metrics, and missing values", () => {
  const row: ArdtsWorkstreamComparisonRow = {
    key: "referral",
    label: "Referrals",
    is_total: false,
    total: 23,
    metrics: {
      needs_booking: { count: 17, percent: 74, applicable: true },
      fu_needed: { count: null, percent: null, applicable: false },
    },
  };

  assert.equal(comparisonMetricLabel(comparisonMetric(row, "total")), "23");
  assert.equal(comparisonMetricLabel(comparisonMetric(row, "needs_booking")), "17");
  assert.equal(comparisonMetricLabel(comparisonMetric(row, "fu_needed")), "N/A");
  assert.equal(comparisonMetricLabel(comparisonMetric(row, "unknown")), "—");
});

test("booking-rate bar widths stay within the visual range", () => {
  assert.equal(boundedPercent(-5), 0);
  assert.equal(boundedPercent(77), 77);
  assert.equal(boundedPercent(105), 100);
  assert.equal(boundedPercent(Number.NaN), 0);
});

test("whole-month hover accepts empty space above and slightly beside a bar", () => {
  const centers = [40, 80, 120, 160];
  assert.equal(nearestTrackedMonthIndex(centers, 120), 2);
  assert.equal(nearestTrackedMonthIndex(centers, 141), 3);
  assert.equal(nearestTrackedMonthIndex(centers, 185), null);
  assert.equal(nearestTrackedMonthIndex([], 40), null);
});
