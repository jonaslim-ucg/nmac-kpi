type QueueMetricRow = {
  level: "queue" | "extension" | "total";
  queue: string;
  queueNumber: string;
  received: number | null;
  serviced: number | null;
  unanswered: number | null;
};

type QueueMetrics = {
  received: number;
  answered: number;
  missed: number;
  answeredRate: number;
};

const FRONT_DESK_HANDOFF_START_DATE = "2026-07-01";
const FRONT_DESK_QUEUE_NUMBER = "809";
const VIRTUAL_STAFF_QUEUE_NUMBER = "811";

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function queueNumber(row: QueueMetricRow) {
  const explicitNumber = row.queueNumber.trim();
  if (explicitNumber) return explicitNumber;
  return row.queue.trim().match(/^(\d+)/)?.[1] ?? "";
}

export function queueMetricsFromRows(
  rows: QueueMetricRow[],
  reportStartDate?: string,
): QueueMetrics {
  const queueRows = rows.filter((row) => row.level === "queue");
  const received = queueRows.reduce((sum, row) => sum + (row.received ?? 0), 0);
  const answered = queueRows.reduce((sum, row) => sum + (row.serviced ?? 0), 0);
  let missed = queueRows.reduce((sum, row) => sum + (row.unanswered ?? 0), 0);
  let answerRateReceived = received;

  if (reportStartDate && reportStartDate >= FRONT_DESK_HANDOFF_START_DATE) {
    const frontDeskRows = queueRows.filter((row) => queueNumber(row) === FRONT_DESK_QUEUE_NUMBER);
    const virtualStaffRows = queueRows.filter((row) => queueNumber(row) === VIRTUAL_STAFF_QUEUE_NUMBER);

    if (frontDeskRows.length > 0 && virtualStaffRows.length > 0) {
      const callsReceivedByFrontDesk = frontDeskRows.reduce((sum, row) => sum + (row.received ?? 0), 0);
      const frontDeskUnanswered = frontDeskRows.reduce((sum, row) => sum + (row.unanswered ?? 0), 0);
      const virtualStaffUnanswered = virtualStaffRows.reduce((sum, row) => sum + (row.unanswered ?? 0), 0);
      const remainingUnanswered = queueRows
        .filter((row) => {
          const number = queueNumber(row);
          return number !== FRONT_DESK_QUEUE_NUMBER && number !== VIRTUAL_STAFF_QUEUE_NUMBER;
        })
        .reduce((sum, row) => sum + (row.unanswered ?? 0), 0);

      missed = virtualStaffUnanswered - callsReceivedByFrontDesk + frontDeskUnanswered + remainingUnanswered;
      answerRateReceived = received - callsReceivedByFrontDesk;
    }
  }

  return {
    received,
    answered,
    missed,
    answeredRate: answerRateReceived > 0 ? round1((answered / answerRateReceived) * 100) : 0,
  };
}
