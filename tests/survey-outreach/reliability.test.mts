import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SURVEY_SEND_ATTEMPTS,
  surveySendRetryAt,
} from "../../lib/survey-outreach/reliability.ts";
import { noEarlierThanMinimumMessageGap } from "../../lib/survey-outreach/schedule.ts";

test("backs off repeated email failures instead of retrying every minute", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  assert.equal(
    surveySendRetryAt({ attempt: 1, now })?.toISOString(),
    "2026-07-15T12:02:00.000Z",
  );
  assert.equal(
    surveySendRetryAt({ attempt: 3, now })?.toISOString(),
    "2026-07-15T12:15:00.000Z",
  );
});

test("honors a longer provider retry-after delay", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  assert.equal(
    surveySendRetryAt({ attempt: 1, now, retryAfterMs: 10 * 60 * 1000 })?.toISOString(),
    "2026-07-15T12:10:00.000Z",
  );
});

test("quarantines a message after the maximum attempt count", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  assert.equal(surveySendRetryAt({ attempt: MAX_SURVEY_SEND_ATTEMPTS, now }), null);
});

test("prevents overdue reminders from being sent back-to-back", () => {
  const planned = new Date("2026-07-15T12:00:00.000Z");
  const previousSent = new Date("2026-07-16T08:00:00.000Z");
  assert.equal(
    noEarlierThanMinimumMessageGap(planned, previousSent).toISOString(),
    "2026-07-17T08:00:00.000Z",
  );
});
