import assert from "node:assert/strict";
import test from "node:test";
import { queueMetricsFromRows } from "../../lib/3cx/queue-metrics.ts";

type QueueRowInput = {
  queueNumber: string;
  received: number;
  serviced: number;
  unanswered: number;
};

function queueRow(input: QueueRowInput) {
  return {
    level: "queue" as const,
    queue: `${input.queueNumber} Queue`,
    queueNumber: input.queueNumber,
    received: input.received,
    serviced: input.serviced,
    unanswered: input.unanswered,
  };
}

const SCREENSHOT_ROWS = [
  queueRow({ queueNumber: "809", received: 230, serviced: 218, unanswered: 12 }),
  queueRow({ queueNumber: "810", received: 22, serviced: 18, unanswered: 4 }),
  queueRow({ queueNumber: "811", received: 645, serviced: 401, unanswered: 244 }),
  queueRow({ queueNumber: "827", received: 1, serviced: 0, unanswered: 1 }),
];

test("uses the 809/811 handoff formula starting in July 2026", () => {
  const metrics = queueMetricsFromRows(SCREENSHOT_ROWS, "2026-07-01");

  assert.deepEqual(metrics, {
    received: 898,
    answered: 637,
    missed: 31,
    answeredRate: 95.4,
  });
});

test("keeps the original unanswered total before July 2026", () => {
  const metrics = queueMetricsFromRows(SCREENSHOT_ROWS, "2026-06-30");

  assert.equal(metrics.missed, 261);
  assert.equal(metrics.answeredRate, 70.9);
});

test("does not subtract 809 received unless both handoff queues are present", () => {
  const withoutVirtualStaff = SCREENSHOT_ROWS.filter((row) => row.queueNumber !== "811");
  const withoutFrontDesk = SCREENSHOT_ROWS.filter((row) => row.queueNumber !== "809");

  assert.equal(queueMetricsFromRows(withoutVirtualStaff, "2026-07-01").missed, 17);
  assert.equal(queueMetricsFromRows(withoutFrontDesk, "2026-07-01").missed, 249);
});

test("uses unique received calls for the July whole-month answer rate", () => {
  const metrics = queueMetricsFromRows(
    [
      queueRow({ queueNumber: "809", received: 905, serviced: 748, unanswered: 157 }),
      queueRow({ queueNumber: "810", received: 70, serviced: 62, unanswered: 8 }),
      queueRow({ queueNumber: "811", received: 2_099, serviced: 1_142, unanswered: 957 }),
      queueRow({ queueNumber: "827", received: 3, serviced: 2, unanswered: 1 }),
      queueRow({ queueNumber: "838", received: 12, serviced: 1, unanswered: 11 }),
      queueRow({ queueNumber: "839", received: 8, serviced: 0, unanswered: 8 }),
      queueRow({ queueNumber: "840", received: 5, serviced: 1, unanswered: 4 }),
    ],
    "2026-07-01",
  );

  assert.deepEqual(metrics, {
    received: 3_102,
    answered: 1_956,
    missed: 241,
    answeredRate: 89,
  });
});
