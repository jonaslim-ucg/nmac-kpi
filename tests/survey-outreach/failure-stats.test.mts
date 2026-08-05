import assert from "node:assert/strict";
import test from "node:test";

import { summarizeTrackedSurveyEmailFailures } from "../../lib/survey-outreach/failure-stats.ts";

test("counts every NDR stage and adds non-NDR permanent failures", () => {
  const summary = summarizeTrackedSurveyEmailFailures(
    [
      { graph_message_id: "initial-ndr", outreach_id: "outreach-1", stage: "initial" },
      { graph_message_id: "reminder-ndr", outreach_id: "outreach-1", stage: "reminder1" },
      { graph_message_id: "legacy-ndr", outreach_id: "outreach-2", stage: null },
    ],
    [
      { id: "outreach-1", failed_stage: "initial" },
      { id: "outreach-3", failed_stage: "initial" },
    ],
  );

  assert.deepEqual(summary, {
    total: 4,
    bounceReports: 3,
    permanentSendFailures: 1,
  });
});

test("does not double-count a repeated database copy of one NDR", () => {
  const summary = summarizeTrackedSurveyEmailFailures([
    { graph_message_id: "same-message", outreach_id: "outreach-1", stage: "initial" },
    { graph_message_id: "same-message", outreach_id: "outreach-1", stage: "initial" },
  ]);

  assert.equal(summary.total, 1);
});
