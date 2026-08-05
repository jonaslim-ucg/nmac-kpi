import assert from "node:assert/strict";
import test from "node:test";

import {
  checkoutRowsSinceSurveyLaunch,
  reconcileSurveyCheckouts,
} from "../../lib/survey-outreach/checkout-reconciliation.ts";
import type { SurveyOutreachRow } from "../../lib/survey-outreach/types.ts";

function outreach(overrides: Partial<SurveyOutreachRow>): SurveyOutreachRow {
  return {
    id: "outreach-1",
    created_at: "2026-07-24T12:00:00.000Z",
    survey_token: "token-1",
    crm_appointment_id: "100",
    crm_appointment_ids: ["100"],
    patient_acc_number: "patient-1",
    outreach_group_key: "patient-1:2026-07-24",
    merged_into_outreach_id: null,
    patient_email: "patient@example.com",
    patient_name: "Patient",
    appointment_date: "2026-07-24",
    appointment_at: "2026-07-24T12:00:00.000Z",
    appointment_providers: null,
    provider_names: [],
    visit_types: [],
    is_test: false,
    initial_sent_at: null,
    reminder_1_sent_at: null,
    reminder_2_sent_at: null,
    final_sent_at: null,
    manual_next_scheduled_at: null,
    completed_at: null,
    send_lock_token: null,
    send_lock_stage: null,
    send_lock_until: null,
    last_delivery_key: null,
    send_attempt_count: 0,
    last_send_attempt_at: null,
    next_retry_at: null,
    last_send_error: null,
    failed_stage: null,
    permanently_failed_at: null,
    status: "pending",
    recalled_at: null,
    recall_reason: null,
    ...overrides,
  };
}

test("segregates checkout delivery discrepancies without double counting failures", () => {
  const result = reconcileSurveyCheckouts(
    [{
      appointment_date: "2026-07-24",
      checkout_count: 9,
      distinct_patient_count: 7,
      eligible_survey_count: 6,
      no_email_count: 1,
      survey_groups: [
        { appointmentIds: ["100", "101"], hasEmail: true },
        { appointmentIds: ["200"], hasEmail: true },
        { appointmentIds: ["300"], hasEmail: true },
        { appointmentIds: ["400"], hasEmail: true },
        { appointmentIds: ["500"], hasEmail: true },
        { appointmentIds: ["600"], hasEmail: true },
        { appointmentIds: ["700", "701"], hasEmail: false },
      ],
    }],
    [
      outreach({
        id: "sent-group",
        crm_appointment_id: "100",
        crm_appointment_ids: ["100", "101"],
        initial_sent_at: "2026-07-25T12:00:00.000Z",
      }),
      outreach({ id: "pending", crm_appointment_id: "200", crm_appointment_ids: ["200"] }),
      outreach({
        id: "bounce",
        crm_appointment_id: "400",
        crm_appointment_ids: ["400"],
        initial_sent_at: "2026-07-25T12:00:00.000Z",
      }),
      outreach({
        id: "failed",
        crm_appointment_id: "500",
        crm_appointment_ids: ["500"],
        failed_stage: "initial",
        permanently_failed_at: "2026-07-25T12:00:00.000Z",
        status: "failed",
      }),
      outreach({
        id: "suppressed",
        crm_appointment_id: "600",
        crm_appointment_ids: ["600"],
        recalled_at: "2026-07-25T12:00:00.000Z",
        status: "skipped",
      }),
    ],
    [{ outreach_id: "bounce", recipient_email: null, stage: "initial", is_test: false }],
  );

  assert.equal(result.ready, true);
  assert.equal(result.patientDayGroups, 7);
  assert.equal(result.noEmail, 1);
  assert.equal(result.notSent, 3);
  assert.deepEqual(result.discrepancies.sentThroughSameDayGroup.appointmentIds, ["101"]);
  assert.deepEqual(result.discrepancies.pendingNotSent.appointmentIds, ["200"]);
  assert.deepEqual(result.discrepancies.emailWithoutOutreach.appointmentIds, ["300"]);
  assert.deepEqual(result.discrepancies.bounced.appointmentIds, ["400"]);
  assert.deepEqual(result.discrepancies.failedBeforeSend.appointmentIds, ["500"]);
  assert.deepEqual(result.discrepancies.suppressedBeforeSend.appointmentIds, ["600"]);
  assert.deepEqual(result.discrepancies.noEmail.appointmentIds, ["700", "701"]);
});

test("marks legacy checkout snapshots as not ready while retaining delivery failures", () => {
  const result = reconcileSurveyCheckouts(
    [{ appointment_date: "2026-07-24", checkout_count: 10 }],
    [outreach({
      id: "bounce",
      crm_appointment_id: "400",
      crm_appointment_ids: ["400"],
      initial_sent_at: "2026-07-25T12:00:00.000Z",
    })],
    [{ outreach_id: "bounce", recipient_email: null, stage: "initial", is_test: false }],
  );

  assert.equal(result.ready, false);
  assert.equal(result.noEmail, 0);
  assert.equal(result.notSent, 0);
  assert.equal(result.discrepancies.bounced.groupCount, 1);
});

test("excludes checkout snapshots from before the first production survey", () => {
  const rows = [
    { appointment_date: "2026-07-20", checkout_count: 10 },
    { appointment_date: "2026-07-21", checkout_count: 11 },
    { appointment_date: "2026-07-22", checkout_count: 12 },
  ];

  assert.deepEqual(
    checkoutRowsSinceSurveyLaunch(rows, "2026-07-21").map((row) => row.appointment_date),
    ["2026-07-21", "2026-07-22"],
  );
  assert.equal(checkoutRowsSinceSurveyLaunch(rows, null).length, 3);
});
