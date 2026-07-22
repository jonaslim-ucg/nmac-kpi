import assert from "node:assert/strict";
import test from "node:test";
import {
  dailyOutreachGroupKey,
  groupDailyOutreachAppointments,
  type DailyOutreachAppointment,
} from "../../lib/survey-outreach/daily-group.ts";
import { initialSurveyDueAt } from "../../lib/survey-outreach/schedule.ts";

const BASE_APPOINTMENT: DailyOutreachAppointment = {
  crmAppointmentId: "101",
  patientAccNumber: "A-100",
  patientEmail: "patient@example.com",
  patientName: "Patient One",
  appointmentDate: "2026-07-16",
  appointmentAt: "2026-07-16T13:00:00.000Z",
  providerName: "Brown, Kyjuan",
  visitType: "Medical FU",
};

test("groups same-patient same-day appointments and anchors to the latest appointment", () => {
  const groups = groupDailyOutreachAppointments([
    BASE_APPOINTMENT,
    {
      ...BASE_APPOINTMENT,
      crmAppointmentId: "102",
      appointmentAt: "2026-07-16T17:30:00.000Z",
      providerName: "Estwick, Paula",
      visitType: "Aesthetics",
    },
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].appointmentIds, ["101", "102"]);
  assert.deepEqual(groups[0].appointmentProviders, {
    "101": "Brown, Kyjuan",
    "102": "Estwick, Paula",
  });
  assert.deepEqual(groups[0].providerNames, ["Brown, Kyjuan", "Estwick, Paula"]);
  assert.equal(groups[0].appointmentAt, "2026-07-16T17:30:00.000Z");
  assert.equal(
    initialSurveyDueAt(new Date(groups[0].appointmentAt), {
      initialDelayHours: 24,
      reminder1Days: 3,
      reminder2Days: 7,
      finalReminderDays: 14,
    }).toISOString(),
    "2026-07-17T17:30:00.000Z",
  );
});

test("does not merge different patient accounts that share an email address", () => {
  const groups = groupDailyOutreachAppointments([
    BASE_APPOINTMENT,
    {
      ...BASE_APPOINTMENT,
      crmAppointmentId: "202",
      patientAccNumber: "A-200",
      patientName: "Patient Two",
    },
  ]);

  assert.equal(groups.length, 2);
});

test("keeps separate appointment days in separate outreach groups", () => {
  const groups = groupDailyOutreachAppointments([
    BASE_APPOINTMENT,
    {
      ...BASE_APPOINTMENT,
      crmAppointmentId: "103",
      appointmentDate: "2026-07-17",
      appointmentAt: "2026-07-17T13:00:00.000Z",
    },
  ]);

  assert.equal(groups.length, 2);
});

test("falls back to normalized email and name when an account number is unavailable", () => {
  const first = dailyOutreachGroupKey({
    patientAccNumber: null,
    patientEmail: "PATIENT@example.com ",
    patientName: " Patient   One ",
    appointmentDate: "2026-07-16",
  });
  const second = dailyOutreachGroupKey({
    patientAccNumber: null,
    patientEmail: "patient@example.com",
    patientName: "patient one",
    appointmentDate: "2026-07-16",
  });

  assert.equal(first, second);
});

test("deduplicates repeated CRM appointments and provider names", () => {
  const groups = groupDailyOutreachAppointments([
    BASE_APPOINTMENT,
    { ...BASE_APPOINTMENT, providerName: "brown, kyjuan" },
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].appointmentIds, ["101"]);
  assert.deepEqual(groups[0].providerNames, ["Brown, Kyjuan"]);
});
