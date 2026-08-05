import assert from "node:assert/strict";
import test from "node:test";

import { summarizeDailyCheckouts } from "../../lib/survey-outreach/checkout-stats.ts";

test("summarizes daily checkout snapshots", () => {
  assert.deepEqual(
    summarizeDailyCheckouts([
      { appointment_date: "2026-08-01", checkout_count: 0 },
      { appointment_date: "2026-08-02", checkout_count: 12 },
      { appointment_date: "2026-08-03", checkout_count: 25 },
    ]),
    { total: 37, trackedDays: 3, averagePerDay: 12.3 },
  );
});

test("keeps one checkout snapshot per date", () => {
  assert.deepEqual(
    summarizeDailyCheckouts([
      { appointment_date: "2026-08-01", checkout_count: 10 },
      { appointment_date: "2026-08-01", checkout_count: 14 },
    ]),
    { total: 14, trackedDays: 1, averagePerDay: 14 },
  );
});

test("ignores invalid checkout snapshots", () => {
  assert.deepEqual(
    summarizeDailyCheckouts([
      { appointment_date: "invalid", checkout_count: 10 },
      { appointment_date: "2026-08-01", checkout_count: -1 },
    ]),
    { total: 0, trackedDays: 0, averagePerDay: 0 },
  );
});
