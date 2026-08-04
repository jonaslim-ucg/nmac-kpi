import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeUniqueSurveyBounces,
  uniqueSurveyBounceRows,
  type SurveyBounceIdentityRow,
} from "../../lib/survey-outreach/bounce-dedupe.ts";

const rows: SurveyBounceIdentityRow[] = [
  {
    graph_message_id: "newest",
    recipient_email: "Patient@Example.com",
    outreach_id: "outreach-1",
    is_test: false,
    hard_bounce: true,
  },
  {
    graph_message_id: "older-reminder",
    recipient_email: " patient@example.com ",
    outreach_id: "outreach-1",
    is_test: false,
    hard_bounce: true,
  },
  {
    graph_message_id: "second-recipient",
    recipient_email: "other@example.com",
    outreach_id: "outreach-2",
    is_test: false,
    hard_bounce: true,
  },
];

test("keeps only the newest failure for a duplicate recipient address", () => {
  assert.deepEqual(
    uniqueSurveyBounceRows(rows).map((row) => row.graph_message_id),
    ["newest", "second-recipient"],
  );
});

test("counts unique recipient addresses in bounce KPIs", () => {
  assert.deepEqual(summarizeUniqueSurveyBounces(rows), {
    total: 2,
    production: 2,
    tests: 0,
    unmatched: 0,
    hard: 2,
  });
});

test("does not merge unknown recipients without a shared outreach row", () => {
  const unknown = rows.slice(0, 0).concat(
    {
      graph_message_id: "unknown-1",
      recipient_email: null,
      outreach_id: null,
      is_test: null,
      hard_bounce: true,
    },
    {
      graph_message_id: "unknown-2",
      recipient_email: null,
      outreach_id: null,
      is_test: null,
      hard_bounce: true,
    },
  );
  assert.equal(summarizeUniqueSurveyBounces(unknown).total, 2);
});
