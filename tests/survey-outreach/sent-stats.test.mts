import assert from "node:assert/strict";
import test from "node:test";

import { summarizeUniqueInitialRecipients } from "../../lib/survey-outreach/sent-stats.ts";

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
