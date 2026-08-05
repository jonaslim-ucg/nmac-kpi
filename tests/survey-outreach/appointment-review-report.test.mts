import assert from "node:assert/strict";
import test from "node:test";
import {
  buildResponseOnlyAppointmentReport,
  buildProviderAppointmentReport,
  mergeProviderAppointmentReports,
  parseAppointmentReviewReportRange,
  type SurveyReportOutreachRow,
} from "../../lib/appointment-review/report.ts";

function outreach(overrides: Partial<SurveyReportOutreachRow>): SurveyReportOutreachRow {
  return {
    id: "outreach-1",
    survey_token: "survey-token-1",
    crm_appointment_id: "101",
    crm_appointment_ids: ["101"],
    appointment_date: "2026-07-22",
    appointment_at: "2026-07-22T15:00:00.000Z",
    appointment_providers: { "101": "Brown, Kyjuan" },
    provider_names: ["Brown, Kyjuan"],
    initial_sent_at: "2026-07-22T17:00:00.000Z",
    completed_at: null,
    is_test: false,
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

test("parses an explicit quarter with its close and announcement dates", () => {
  const result = parseAppointmentReviewReportRange(
    new URLSearchParams({ quarter: "2026-Q3" }),
    new Date("2026-07-23T12:00:00.000Z"),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.range, {
    dateStart: "2026-07-01",
    dateEnd: "2026-09-30",
    startAt: "2026-07-01T03:00:00.000Z",
    endBefore: "2026-10-01T03:00:00.000Z",
    quarter: {
      id: "2026-Q3",
      year: 2026,
      quarter: 3,
      label: "Q3 2026",
      dateStart: "2026-07-01",
      dateEnd: "2026-09-30",
      resultsFinalDate: "2026-10-01",
      announcementStartDate: "2026-10-01",
      announcementEndDate: "2026-10-14",
      status: "open",
    },
  });
});

test("marks a finished quarter closed and rejects malformed quarter filters", () => {
  const result = parseAppointmentReviewReportRange(
    new URLSearchParams({ quarter: "2026-Q3" }),
    new Date("2026-10-15T12:00:00.000Z"),
  );

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.range.quarter?.status, "closed");
  assert.deepEqual(
    parseAppointmentReviewReportRange(new URLSearchParams({ quarter: "Q3-2026" })),
    { ok: false, error: "quarter must use YYYY-Q1 through YYYY-Q4." },
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
  assert.equal(result.appointments[0].source, "outreach");
  assert.equal(result.appointments[0].reviewId, null);
  assert.equal(result.appointments[0].isTest, false);
  assert.equal(result.appointments[0].initialDeliveryStatus, "successful");
  assert.equal(result.appointments[0].providerMappingComplete, true);
  assert.deepEqual(result.appointments[0].providerAppointments, [
    { appointmentId: "101", providerName: "Brown, Kyjuan" },
    { appointmentId: "102", providerName: "Brown, Kyjuan" },
  ]);
});

test("reports provider appointments inferred from unlinked survey responses", () => {
  const responseOnly = buildResponseOnlyAppointmentReport([
    {
      reviewId: "review-1",
      createdAt: "2026-07-22T13:38:03.841684+00:00",
      providerNames: ["Dr. Davor Dzepina"],
      isTest: true,
    },
  ]);
  const result = mergeProviderAppointmentReports(
    { providers: [], appointments: [] },
    responseOnly,
  );

  assert.deepEqual(result.providers, [
    {
      providerName: "Dr. Davor Dzepina",
      appointmentCount: 1,
      surveySentCount: 0,
      responseCount: 1,
      appointmentCountEstimated: true,
    },
  ]);
  assert.deepEqual(result.appointments, [
    {
      source: "response",
      outreachId: null,
      reviewId: "review-1",
      isTest: true,
      appointmentDate: null,
      appointmentAt: null,
      appointmentIds: [],
      appointmentCount: 1,
      providerNames: ["Dr. Davor Dzepina"],
      providerCount: 1,
      providerAppointments: [],
      providerMappingComplete: false,
      initialSentAt: null,
      initialDeliveryStatus: "not_sent",
      respondedAt: "2026-07-22T13:38:03.841684+00:00",
    },
  ]);
});

test("excludes a known failed initial delivery from provider sent totals", () => {
  const result = buildProviderAppointmentReport([
    outreach({ initial_delivery_failed: true }),
  ]);

  assert.equal(result.providers[0].appointmentCount, 1);
  assert.equal(result.providers[0].surveySentCount, 0);
  assert.equal(result.appointments[0].initialDeliveryStatus, "failed");
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

test("maps a linked survey provider to a single appointment when CRM provider data is absent", () => {
  const result = buildProviderAppointmentReport([
    outreach({
      appointment_providers: null,
      provider_names: ["Dr. Davor Dzepina"],
      is_test: true,
      completed_at: "2026-07-22T19:00:00.000Z",
    }),
  ]);

  assert.deepEqual(result.providers, [
    {
      providerName: "Dr. Davor Dzepina",
      appointmentCount: 1,
      surveySentCount: 1,
      responseCount: 1,
      appointmentCountEstimated: false,
    },
  ]);
  assert.deepEqual(result.appointments[0].providerAppointments, [
    { appointmentId: "101", providerName: "Dr. Davor Dzepina" },
  ]);
  assert.equal(result.appointments[0].providerMappingComplete, true);
  assert.equal(result.appointments[0].isTest, true);
});
