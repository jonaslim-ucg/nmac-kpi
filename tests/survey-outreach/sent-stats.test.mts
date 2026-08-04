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
