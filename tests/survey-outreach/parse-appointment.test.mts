import assert from "node:assert/strict";
import test from "node:test";
import { parseCrmAppointmentAt } from "../../lib/survey-outreach/parse-appointment.ts";

test("interprets a bare summer appointment time in Bermuda", () => {
  assert.equal(
    parseCrmAppointmentAt("2026-07-15", "09:00:00")?.toISOString(),
    "2026-07-15T12:00:00.000Z",
  );
});

test("interprets a bare winter appointment time in Bermuda", () => {
  assert.equal(
    parseCrmAppointmentAt("2026-01-15", "09:00:00")?.toISOString(),
    "2026-01-15T13:00:00.000Z",
  );
});

test("treats the CRM time-only +00 suffix as Bermuda clinic time", () => {
  assert.equal(
    parseCrmAppointmentAt("2026-07-15", "09:00:00+00")?.toISOString(),
    "2026-07-15T12:00:00.000Z",
  );
});

test("preserves an explicit offset on a full CRM timestamp", () => {
  assert.equal(
    parseCrmAppointmentAt("2026-07-15", "2026-07-15T09:00:00+00")?.toISOString(),
    "2026-07-15T09:00:00.000Z",
  );
});

test("treats a full timestamp without an offset as Bermuda clinic time", () => {
  assert.equal(
    parseCrmAppointmentAt("2026-07-15", "2026-07-15T09:00:00")?.toISOString(),
    "2026-07-15T12:00:00.000Z",
  );
});

test("rejects invalid appointment times", () => {
  assert.equal(parseCrmAppointmentAt("2026-07-15", "25:00:00"), null);
  assert.equal(parseCrmAppointmentAt("2026-02-30", "09:00:00"), null);
  assert.equal(parseCrmAppointmentAt("not-a-date", "09:00:00"), null);
});
