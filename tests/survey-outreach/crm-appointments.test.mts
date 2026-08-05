import assert from "node:assert/strict";
import test from "node:test";
import { crmSyncLookbackDays } from "../../lib/crm/appointments.ts";

test("uses a small CRM checkout lookback on ordinary scheduler runs", () => {
  assert.equal(crmSyncLookbackDays(new Date("2026-08-05T12:01:00.000Z")), 1);
});

test("reconciles three days every fifteen minutes", () => {
  assert.equal(crmSyncLookbackDays(new Date("2026-08-05T12:15:00.000Z")), 3);
  assert.equal(crmSyncLookbackDays(new Date("2026-08-05T12:45:00.000Z")), 3);
});

test("reconciles fourteen days at the top of each hour", () => {
  assert.equal(crmSyncLookbackDays(new Date("2026-08-05T12:00:00.000Z")), 14);
});

test("performs one thirty-day reconciliation each day", () => {
  assert.equal(crmSyncLookbackDays(new Date("2026-08-05T07:00:00.000Z")), 30);
});
