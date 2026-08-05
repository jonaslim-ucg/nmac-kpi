import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDailyInitialSurveySendTrend,
  classifyInitialSurveySends,
  countSuccessfulInitialSurveySends,
  summarizeInitialSurveyKpis,
  summarizeInitialSurveySends,
  summarizeUniqueInitialRecipients,
} from "../../lib/survey-outreach/sent-stats.ts";

test("groups successful initial surveys by checkout date", () => {
  assert.deepEqual(
    buildDailyInitialSurveySendTrend(
      [
        {
          id: "outreach-1",
          patient_email: "first@example.com",
          is_test: false,
          appointment_date: "2026-08-02",
        },
        {
          id: "outreach-2",
          patient_email: "second@example.com",
          is_test: false,
          appointment_date: "2026-08-01",
        },
        {
          id: "outreach-3",
          patient_email: "third@example.com",
          is_test: false,
          appointment_date: "2026-08-02",
        },
        {
          id: "outreach-4",
          patient_email: "bounced@example.com",
          is_test: false,
          appointment_date: "2026-08-01",
        },
      ],
      [
        {
          outreach_id: "outreach-4",
          recipient_email: "bounced@example.com",
          stage: "initial",
          is_test: false,
        },
      ],
    ),
    [
      { date: "2026-08-01", count: 1 },
      { date: "2026-08-02", count: 2 },
    ],
  );
});

test("summarizes successful, failed, and repeat initial send events", () => {
  assert.deepEqual(
    summarizeInitialSurveySends(
      [
        { id: "outreach-1", patient_email: "patient@example.com", is_test: false },
        { id: "outreach-2", patient_email: " Patient@example.com ", is_test: false },
        { id: "outreach-3", patient_email: "failed@example.com", is_test: false },
        { id: "outreach-4", patient_email: "other@example.com", is_test: false },
      ],
      [
        {
          outreach_id: "outreach-3",
          recipient_email: "failed@example.com",
          stage: "initial",
          is_test: false,
        },
      ],
    ),
    {
      total: 4,
      successful: 3,
      failed: 1,
      repeatSuccessful: 1,
    },
  );
});

test("counts repeat initial sends while excluding the specific failed message", () => {
  assert.equal(
    countSuccessfulInitialSurveySends(
      [
        { id: "outreach-1", patient_email: "patient@example.com", is_test: false },
        { id: "outreach-2", patient_email: "patient@example.com", is_test: false },
        { id: "outreach-3", patient_email: "other@example.com", is_test: false },
      ],
      [
        {
          outreach_id: "outreach-1",
          recipient_email: "patient@example.com",
          stage: "initial",
          is_test: false,
        },
      ],
    ),
    2,
  );
});

test("classifies the exact sent rows with known initial delivery failures", () => {
  const rows = [
    { id: "outreach-1", patient_email: "sent@example.com", is_test: false },
    { id: "outreach-2", patient_email: "failed@example.com", is_test: false },
  ];
  const result = classifyInitialSurveySends(rows, [
    {
      outreach_id: "outreach-2",
      recipient_email: "failed@example.com",
      stage: "initial",
      is_test: false,
    },
  ]);

  assert.deepEqual(result.successfulRows.map((row) => row.id), ["outreach-1"]);
  assert.deepEqual(result.failedRows.map((row) => row.id), ["outreach-2"]);
});

test("adds permanent pre-send failures to appointment-date initial survey KPIs", () => {
  assert.deepEqual(
    summarizeInitialSurveyKpis(
      [
        { id: "outreach-1", patient_email: "patient@example.com", is_test: false },
        { id: "outreach-2", patient_email: "patient@example.com", is_test: false },
        { id: "outreach-3", patient_email: "bounced@example.com", is_test: false },
      ],
      [
        {
          outreach_id: "outreach-3",
          recipient_email: "bounced@example.com",
          stage: "initial",
          is_test: false,
        },
      ],
      [
        { id: "outreach-4", failed_stage: "initial", initial_sent_at: null },
        { id: "outreach-5", failed_stage: "reminder1", initial_sent_at: "2026-08-01T12:00:00Z" },
      ],
    ),
    {
      attempted: 4,
      successful: 2,
      uniqueSuccessfulRecipients: 1,
      repeatSuccessful: 1,
      failed: 2,
      bounced: 1,
      permanentPreSendFailures: 1,
    },
  );
});

test("does not remove an initial send for a reminder failure", () => {
  assert.equal(
    countSuccessfulInitialSurveySends(
      [{ id: "outreach-1", patient_email: "patient@example.com", is_test: false }],
      [
        {
          outreach_id: "outreach-1",
          recipient_email: "patient@example.com",
          stage: "reminder1",
          is_test: false,
        },
      ],
    ),
    1,
  );
});

test("counts one initial survey per normalized recipient email", () => {
  assert.deepEqual(
    summarizeUniqueInitialRecipients([
      { patient_email: "patient@example.com", is_test: false },
      { patient_email: " Patient@Example.com ", is_test: false },
      { patient_email: "other@example.com", is_test: false },
    ]),
    { total: 2, production: 2, tests: 0 },
  );
});

test("keeps production and test recipient counts separate", () => {
  assert.deepEqual(
    summarizeUniqueInitialRecipients([
      { patient_email: "live@example.com", is_test: false },
      { patient_email: "test@example.com", is_test: true },
      { patient_email: "test@example.com", is_test: true },
    ]),
    { total: 2, production: 1, tests: 1 },
  );
});

test("excludes recipients whose initial survey bounced", () => {
  assert.deepEqual(
    summarizeUniqueInitialRecipients(
      [
        { id: "outreach-1", patient_email: "failed@example.com", is_test: false },
        { id: "outreach-2", patient_email: "delivered@example.com", is_test: false },
      ],
      [
        {
          outreach_id: "outreach-1",
          recipient_email: "failed@example.com",
          stage: "initial",
          is_test: false,
        },
      ],
    ),
    { total: 1, production: 1, tests: 0 },
  );
});

test("does not exclude an initial recipient because a reminder bounced", () => {
  assert.deepEqual(
    summarizeUniqueInitialRecipients(
      [{ id: "outreach-1", patient_email: "patient@example.com", is_test: false }],
      [
        {
          outreach_id: "outreach-1",
          recipient_email: "patient@example.com",
          stage: "reminder1",
          is_test: false,
        },
      ],
    ),
    { total: 1, production: 1, tests: 0 },
  );
});

test("counts a recipient when a later initial delivery did not bounce", () => {
  assert.deepEqual(
    summarizeUniqueInitialRecipients(
      [
        { id: "outreach-1", patient_email: "patient@example.com", is_test: false },
        { id: "outreach-2", patient_email: "patient@example.com", is_test: false },
      ],
      [
        {
          outreach_id: "outreach-1",
          recipient_email: "patient@example.com",
          stage: "initial",
          is_test: false,
        },
      ],
    ),
    { total: 1, production: 1, tests: 0 },
  );
});

test("uses unmatched bounce emails without mixing test and production totals", () => {
  assert.deepEqual(
    summarizeUniqueInitialRecipients(
      [
        { id: "live", patient_email: "shared@example.com", is_test: false },
        { id: "test", patient_email: "shared@example.com", is_test: true },
      ],
      [
        {
          outreach_id: null,
          recipient_email: " SHARED@example.com ",
          stage: "initial",
          is_test: true,
        },
      ],
    ),
    { total: 1, production: 1, tests: 0 },
  );
});
