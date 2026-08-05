import assert from "node:assert/strict";
import test from "node:test";

import { surveyReportingStartDateFromTimestamp } from "../../lib/survey-outreach/reporting-date.ts";

test("uses the Bermuda date of the first production send", () => {
  assert.equal(
    surveyReportingStartDateFromTimestamp("2026-07-22T19:49:52.017Z"),
    "2026-07-22",
  );
});

test("handles a UTC timestamp that falls on the prior Bermuda date", () => {
  assert.equal(
    surveyReportingStartDateFromTimestamp("2026-07-22T01:00:00.000Z"),
    "2026-07-21",
  );
});

test("returns null for a missing or invalid timestamp", () => {
  assert.equal(surveyReportingStartDateFromTimestamp(null), null);
  assert.equal(surveyReportingStartDateFromTimestamp("invalid"), null);
});
