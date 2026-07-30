import assert from "node:assert/strict";
import test from "node:test";
import {
  isEndpointCheckoutOutreach,
  schedulerModeAllowsOutreach,
} from "../../lib/survey-outreach/scheduler-eligibility.ts";

const ENDPOINT_CHECKOUT = {
  is_test: false,
  crm_appointment_id: "12345",
  crm_appointment_ids: ["12345"],
};

const MANUAL_TEST = {
  is_test: true,
  crm_appointment_id: "test-2cde327a",
  crm_appointment_ids: [],
};

test("production mode accepts endpoint checkout outreach", () => {
  assert.equal(isEndpointCheckoutOutreach(ENDPOINT_CHECKOUT), true);
  assert.equal(schedulerModeAllowsOutreach(ENDPOINT_CHECKOUT, "production"), true);
});

test("production mode rejects manual test outreach and its reminders", () => {
  assert.equal(isEndpointCheckoutOutreach(MANUAL_TEST), false);
  assert.equal(schedulerModeAllowsOutreach(MANUAL_TEST, "production"), false);
});

test("production mode rejects rows without a CRM checkout source", () => {
  assert.equal(
    schedulerModeAllowsOutreach(
      { is_test: false, crm_appointment_id: null, crm_appointment_ids: [] },
      "production",
    ),
    false,
  );
});

test("production mode accepts grouped endpoint checkout IDs", () => {
  assert.equal(
    schedulerModeAllowsOutreach(
      { is_test: false, crm_appointment_id: null, crm_appointment_ids: ["456", "789"] },
      "production",
    ),
    true,
  );
});

test("test mode accepts only explicit test rows", () => {
  assert.equal(schedulerModeAllowsOutreach(MANUAL_TEST, "test"), true);
  assert.equal(schedulerModeAllowsOutreach(ENDPOINT_CHECKOUT, "test"), false);
});
