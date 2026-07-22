import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProviderAppointmentReport,
  parseAppointmentReviewReportRange,
  type SurveyReportOutreachRow,
} from "../../lib/appointment-review/report.ts";

function outreach(overrides: Partial<SurveyReportOutreachRow>): SurveyReportOutreachRow {
  return {
    id: "outreach-1",
    crm_appointment_id: "101",
    crm_appointment_ids: ["101"],
    appointment_date: "2026-07-22",
    appointment_at: "2026-07-22T15:00:00.000Z",
    appointment_providers: { "101": "Brown, Kyjuan" },
    provider_names: ["Brown, Kyjuan"],
    initial_sent_at: "2026-07-22T17:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

test("parses inclusive clinic-calendar start and end dates", () => {
  const result = parseAppointmentReviewReportRange(
    new URLSearchParams({ dateStart: "2026-07-01", dateEnd: "2026-07-22" }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.range, {
    dateStart: "2026-07-01",
    dateEnd: "2026-07-22",
    startAt: "2026-07-01T03:00:00.000Z",
    endBefore: "2026-07-23T03:00:00.000Z",
  });
});

test("rejects invalid and reversed date filters", () => {
  assert.deepEqual(
    parseAppointmentReviewReportRange(new URLSearchParams({ dateStart: "2026-02-30" })),
    { ok: false, error: "dateStart must use YYYY-MM-DD." },
  );
  assert.deepEqual(
    parseAppointmentReviewReportRange(
      new URLSearchParams({ dateStart: "2026-07-23", dateEnd: "2026-07-22" }),
    ),
    { ok: false, error: "dateStart must be on or before dateEnd." },
  );
});

test("counts exact appointment-to-provider mappings and survey responses", () => {
  const result = buildProviderAppointmentReport([
    outreach({
      crm_appointment_ids: ["101", "102"],
      appointment_providers: {
        "101": "Brown, Kyjuan",
        "102": "Brown, Kyjuan",
      },
      completed_at: "2026-07-22T19:00:00.000Z",
    }),
    outreach({
      id: "outreach-2",
      crm_appointment_id: "103",
      crm_appointment_ids: ["103"],
      appointment_providers: { "103": "Estwick, Paula" },
      provider_names: ["Estwick, Paula"],
    }),
  ]);

  assert.deepEqual(result.providers, [
    {
      providerName: "Brown, Kyjuan",
      appointmentCount: 2,
      surveySentCount: 1,
      responseCount: 1,
      appointmentCountEstimated: false,
    },
    {
      providerName: "Estwick, Paula",
      appointmentCount: 1,
      surveySentCount: 1,
      responseCount: 0,
      appointmentCountEstimated: false,
    },
  ]);
  assert.equal(result.appointments[0].providerCount, 1);
  assert.equal(result.appointments[0].providerMappingComplete, true);
  assert.deepEqual(result.appointments[0].providerAppointments, [
    { appointmentId: "101", providerName: "Brown, Kyjuan" },
    { appointmentId: "102", providerName: "Brown, Kyjuan" },
  ]);
});

test("provides an explicit estimate for legacy multi-provider rows", () => {
  const result = buildProviderAppointmentReport([
    outreach({
      crm_appointment_ids: ["101", "102", "103"],
      appointment_providers: null,
      provider_names: ["Brown, Kyjuan", "Estwick, Paula"],
    }),
  ]);

  assert.equal(result.appointments[0].providerMappingComplete, false);
  assert.deepEqual(
    result.providers.map(({ providerName, appointmentCount, appointmentCountEstimated }) => ({
      providerName,
      appointmentCount,
      appointmentCountEstimated,
    })),
    [
      { providerName: "Brown, Kyjuan", appointmentCount: 1, appointmentCountEstimated: true },
      { providerName: "Estwick, Paula", appointmentCount: 1, appointmentCountEstimated: true },
    ],
  );
});
