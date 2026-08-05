import assert from "node:assert/strict";
import test from "node:test";

import type { CrmAppointmentRow } from "../../lib/crm/appointments.ts";
import {
  buildDailyCheckoutSnapshot,
  buildDailyCheckoutTrend,
  summarizeDailyCheckouts,
} from "../../lib/survey-outreach/checkout-stats.ts";

function crmAppointment(overrides: Partial<CrmAppointmentRow>): CrmAppointmentRow {
  return {
    id: 101,
    appointment_date: "2026-08-01",
    appointment_time: "09:00:00",
    visit_status: "CHK",
    visit_status_label: "Check Out",
    visit_type: "Follow up",
    patient_name: "Doe, Jane",
    patient_acc_number: "10001",
    patient_email: "jane@example.com",
    appointment_provider_name: "Brown, Kyjuan",
    resource_provider_name: null,
    ...overrides,
  };
}

test("builds privacy-light patient-day checkout groups", () => {
  assert.deepEqual(
    buildDailyCheckoutSnapshot("2026-08-01", [
      crmAppointment({ id: 101 }),
      crmAppointment({ id: 102, patient_email: null }),
      crmAppointment({
        id: 201,
        patient_acc_number: "10002",
        patient_name: "Smith, John",
        patient_email: null,
      }),
      crmAppointment({
        id: 301,
        patient_acc_number: null,
        patient_name: "Flood, Amani",
        patient_email: "amani@example.com",
      }),
      crmAppointment({
        id: 302,
        patient_acc_number: null,
        patient_name: "Flood, Another",
        patient_email: "amani@example.com",
      }),
    ]),
    {
      appointment_date: "2026-08-01",
      checkout_count: 5,
      distinct_patient_count: 4,
      eligible_survey_count: 3,
      no_email_count: 1,
      survey_groups: [
        { appointmentIds: ["101", "102"], hasEmail: true },
        { appointmentIds: ["201"], hasEmail: false },
        { appointmentIds: ["301"], hasEmail: true },
        { appointmentIds: ["302"], hasEmail: true },
      ],
    },
  );
});

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

test("summarizes check-outs and extra same-day appointments", () => {
  assert.deepEqual(
    summarizeDailyCheckouts([
      {
        appointment_date: "2026-08-01",
        checkout_count: 10,
        distinct_patient_count: 7,
      },
      {
        appointment_date: "2026-08-02",
        checkout_count: 5,
        distinct_patient_count: 4,
      },
    ]),
    {
      checkouts: 15,
      multipleSameDayAppointments: 4,
    },
  );
});

test("marks same-day appointment totals unavailable when patient counts are missing", () => {
  assert.deepEqual(
    summarizeDailyCheckouts([
      { appointment_date: "2026-08-01", checkout_count: 10 },
    ]),
    {
      checkouts: 10,
      multipleSameDayAppointments: null,
    },
  );
});
