import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyCheckoutTrend } from "../../lib/survey-outreach/checkout-stats.ts";

test("builds a chronological daily checkout trend", () => {
  assert.deepEqual(
    buildDailyCheckoutTrend([
      { appointment_date: "2026-08-03", checkout_count: 25 },
      { appointment_date: "2026-08-01", checkout_count: 0 },
      { appointment_date: "2026-08-02", checkout_count: 12 },
    ]),
    [
      { date: "2026-08-01", count: 0 },
      { date: "2026-08-02", count: 12 },
      { date: "2026-08-03", count: 25 },
    ],
  );
});

test("keeps one checkout snapshot per date", () => {
  assert.deepEqual(
    buildDailyCheckoutTrend([
      { appointment_date: "2026-08-01", checkout_count: 10 },
      { appointment_date: "2026-08-01", checkout_count: 14 },
    ]),
    [{ date: "2026-08-01", count: 14 }],
  );
});

test("ignores invalid checkout snapshots", () => {
  assert.deepEqual(
    buildDailyCheckoutTrend([
      { appointment_date: "invalid", checkout_count: 10 },
      { appointment_date: "2026-02-30", checkout_count: 10 },
      { appointment_date: "2026-08-01", checkout_count: -1 },
    ]),
    [],
  );
});
