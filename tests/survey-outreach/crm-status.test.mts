import assert from "node:assert/strict";
import test from "node:test";
import {
  isCheckedOutVisitStatus,
  outreachIdsNoLongerCheckedOut,
} from "../../lib/survey-outreach/crm-status.ts";

test("normalizes checked-out CRM status codes", () => {
  assert.equal(isCheckedOutVisitStatus("chk"), true);
  assert.equal(isCheckedOutVisitStatus(" CHK "), true);
  assert.equal(isCheckedOutVisitStatus("N/S"), false);
});

test("suppresses an unsent outreach whose appointment explicitly changed status", () => {
  const ids = outreachIdsNoLongerCheckedOut(
    [{ id: "outreach-1", crm_appointment_id: "101", crm_appointment_ids: ["101"] }],
    new Map([["101", "N/S"]]),
  );

  assert.deepEqual(ids, ["outreach-1"]);
});

test("keeps a same-day group when at least one appointment remains checked out", () => {
  const ids = outreachIdsNoLongerCheckedOut(
    [{ id: "outreach-1", crm_appointment_id: "101", crm_appointment_ids: ["101", "102"] }],
    new Map([
      ["101", "N/S"],
      ["102", "CHK"],
    ]),
  );

  assert.deepEqual(ids, []);
});

test("does not suppress when CRM no longer returns the linked appointment", () => {
  const ids = outreachIdsNoLongerCheckedOut(
    [{ id: "outreach-1", crm_appointment_id: "101", crm_appointment_ids: ["101"] }],
    new Map(),
  );

  assert.deepEqual(ids, []);
});

test("does not suppress a group when only some linked appointments are returned", () => {
  const ids = outreachIdsNoLongerCheckedOut(
    [{ id: "outreach-1", crm_appointment_id: "101", crm_appointment_ids: ["101", "102"] }],
    new Map([["101", "N/S"]]),
  );

  assert.deepEqual(ids, []);
});
