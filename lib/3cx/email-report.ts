import type { MonthDb } from "@/lib/kpi-nmac-2026/model";

export type ThreeCxReportRange = "month" | "week1" | "week2" | "week3" | "week4" | "week5" | "last_week";
export type ThreeCxImportRange = ThreeCxReportRange | "day";

export type ThreeCxCallMetrics = {
  received: number;
  answered: number;
  missed: number;
  answeredRate: number;
};

export type ThreeCxImportResult = {
  metrics: ThreeCxCallMetrics;
  values: MonthDb;
  matchedRows: number;
  rows: ThreeCxReportRow[];
};

export type ThreeCxReportRow = {
  queue: string;
  queueNumber: string;
  queueName: string;
  extension: string;
  extensionNumber: string | null;
  extensionName: string;
  label: string;
  level: "queue" | "extension" | "total";
  received: number | null;
  serviced: number | null;
  unanswered: number | null;
  polls: number | null;
  unansweredLabel: string;
  talkTime: string;
  averageTalkTime: string;
  rawColumns: Record<string, string>;
  sourceLine: number | null;
  sortOrder: number | null;
};

type CsvRow = Record<string, string>;
type NormalizedThreeCxRow = {
  label: string;
  received: number | undefined;
  answered: number | undefined;
  missed: number | undefined;
};

type ThreeCxTotals = ThreeCxCallMetrics & {
  matchedRows: number;
};

const EMAIL_RECEIVED_TIME_ZONE = "Asia/Manila";
const REPORT_DAY_TIME_ZONE = "Atlantic/Bermuda";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const RANGE_WEEK_LABELS: Record<ThreeCxImportRange, string> = {
  month: "Full month",
  day: "Daily report",
  week1: "Week 1",
  week2: "Week 2",
  week3: "Week 3",
  week4: "Week 4",
  week5: "Week 5 / Last week",
  last_week: "Last week",
};

export function threeCxRangeLabel(range: ThreeCxImportRange): string {
  return RANGE_WEEK_LABELS[range] ?? RANGE_WEEK_LABELS.month;
}

export function normalizeThreeCxRange(raw: unknown): ThreeCxReportRange {
  if (raw === "week1" || raw === "week2" || raw === "week3" || raw === "week4" || raw === "week5") return raw;
  if (raw === "last_week") return "last_week";
  return "month";
}

export function normalizeThreeCxImportRange(raw: unknown): ThreeCxImportRange {
  return raw === "day" ? "day" : normalizeThreeCxRange(raw);
}

export function reportWindowForMonth(year: number, monthIndex: number, range: ThreeCxReportRange) {
  const monthStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0));

  if (range === "month") return { start: monthStart, end: monthEnd };
  if (range === "last_week") {
    const lastRange = weeklyReportRangesForMonth(year, monthIndex).at(-1);
    return lastRange ? { start: lastRange.start, end: lastRange.end } : { start: monthStart, end: monthEnd };
  }

  const weekNumber = rangeToWeekNumber(range);
  if (weekNumber === null) return { start: monthStart, end: monthEnd };
  const startDay = 1 + (weekNumber - 1) * 7;
  const endDay = weekNumber === 5 || (weekNumber === 4 && !hasFifthReportWeek(year, monthIndex)) ? undefined : startDay + 7;
  return {
    start: new Date(Date.UTC(year, monthIndex, startDay, 0, 0, 0)),
    end: endDay ? new Date(Date.UTC(year, monthIndex, endDay, 0, 0, 0)) : monthEnd,
  };
}

export function weeklyReportRangesForMonth(year: number, monthIndex: number) {
  const out: { range: Exclude<ThreeCxReportRange, "month" | "last_week">; start: Date; end: Date }[] = [];
  for (const range of ["week1", "week2", "week3", "week4", "week5"] as const) {
    if (range === "week5" && !hasFifthReportWeek(year, monthIndex)) continue;
    const window = reportWindowForMonth(year, monthIndex, range);
    out.push({ range, start: window.start, end: window.end });
  }
  return out;
}

function hasFifthReportWeek(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate() > 28;
}

function rangeToWeekNumber(range: ThreeCxReportRange): number | null {
  if (range === "week1") return 1;
  if (range === "week2") return 2;
  if (range === "week3") return 3;
  if (range === "week4") return 4;
  if (range === "week5") return 5;
  return null;
}

export function reportDateRangeForMonth(year: number, monthIndex: number, range: ThreeCxReportRange) {
  const { start, end } = reportWindowForMonth(year, monthIndex, range);
  const inclusiveEnd = new Date(end.getTime() - MS_PER_DAY);
  return {
    startDate: dateOnly(start),
    endDate: dateOnly(inclusiveEnd),
  };
}

export function reportDateRangeForDate(year: number, monthIndex: number, day: number) {
  const value = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0));
  if (Number.isNaN(value.getTime()) || value.getUTCFullYear() !== year || value.getUTCMonth() !== monthIndex) {
    throw new Error("Choose a valid 3CX report date.");
  }
  const date = dateOnly(value);
  return { startDate: date, endDate: date };
}

export function weeklyReportDateRangesForMonth(year: number, monthIndex: number) {
  return weeklyReportRangesForMonth(year, monthIndex).map(({ range, start, end }) => {
    const inclusiveEnd = new Date(end.getTime() - MS_PER_DAY);
    return {
      range,
      startDate: dateOnly(start),
      endDate: dateOnly(inclusiveEnd),
    };
  });
}

export function reportMonthWindow(year: number, monthIndex: number) {
  return {
    start: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0)),
  };
}

export function threeCxPeriodFromEmailReceivedAt(
  receivedDateTime: string | undefined,
  timeZone = EMAIL_RECEIVED_TIME_ZONE,
): { year: number; monthIndex: number; range: ThreeCxReportRange; localDate: string } | null {
  if (!receivedDateTime) return null;
  const date = new Date(receivedDateTime);
  if (Number.isNaN(date.getTime())) return null;

  const local = localDateParts(date, timeZone);
  const firstDayOfMonth = new Date(Date.UTC(local.year, local.monthIndex, 1, 0, 0, 0)).getUTCDay();
  const weekNumber = Math.min(5, Math.max(1, Math.ceil((local.day + firstDayOfMonth) / 7)));
  const range =
    weekNumber === 1 ? "week1" : weekNumber === 2 ? "week2" : weekNumber === 3 ? "week3" : weekNumber === 4 ? "week4" : "week5";

  return {
    year: local.year,
    monthIndex: local.monthIndex,
    range,
    localDate: dateOnly(new Date(Date.UTC(local.year, local.monthIndex, local.day, 0, 0, 0))),
  };
}

export function threeCxDailyPeriodFromEmailReceivedAt(
  receivedDateTime: string | undefined,
  timeZone = REPORT_DAY_TIME_ZONE,
): { year: number; monthIndex: number; day: number; date: string } | null {
  if (!receivedDateTime) return null;
  const date = new Date(receivedDateTime);
  if (Number.isNaN(date.getTime())) return null;

  const local = localDateParts(date, timeZone);
  return {
    year: local.year,
    monthIndex: local.monthIndex,
    day: local.day,
    date: dateOnly(new Date(Date.UTC(local.year, local.monthIndex, local.day, 0, 0, 0))),
  };
}

export function parseThreeCxReportText(text: string): ThreeCxImportResult {
  const rows = parseDelimitedRows(text);
  if (rows.length === 0) {
    throw new Error("The 3CX report did not contain a readable table.");
  }

  const normalized = rows.map((row) => normalizeRow(row));
  const totals = pickTotalRow(normalized) ?? totalRows(normalized);
  const reportRows = rows.map((row) => toReportRow(row)).filter((row) => row.label);

  if (!totals || totals.received <= 0) {
    throw new Error("The 3CX report did not include received call totals.");
  }

  const answeredRate = totals.received > 0 ? round1((totals.answered / totals.received) * 100) : 0;
  const metrics = {
    received: totals.received,
    answered: totals.answered,
    missed: totals.missed,
    answeredRate,
  };

  return {
    metrics,
    matchedRows: totals.matchedRows,
    values: {
      callvol: { ty: metrics.received },
      call_answered: { ty: metrics.answered },
      call_missed: { ty: metrics.missed },
      callrate: { ty: metrics.answeredRate },
    },
    rows: reportRows,
  };
}

function parseDelimitedRows(text: string): CsvRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => /received/i.test(cell)) && row.some((cell) => /serviced|answered/i.test(cell)),
  );
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map((cell) => cleanHeader(cell));
  const out: CsvRow[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((cell) => cell.trim() === "")) continue;
    const item: CsvRow = {};
    headers.forEach((header, i) => {
      if (header) item[header] = row[i]?.trim() ?? "";
    });
    item.__source_line = String(headerIndex + out.length + 2);
    item.__sort_order = String(out.length);
    out.push(item);
  }
  return out;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function localDateParts(value: Date, timeZone: string): { year: number; monthIndex: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) {
    throw new Error(`Could not read 3CX email received date in ${timeZone}.`);
  }
  return { year, monthIndex: month - 1, day };
}

function parseCsv(text: string): string[][] {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && ch === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function cleanHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeRow(row: CsvRow) {
  const label = firstText(row, ["queue", "name", "agent", "extension"]);
  const received = firstNumber(row, [
    "queue_received_calls",
    "received",
    "total_received",
    "calls_received",
    "incoming",
    "incoming_calls",
  ]);
  const answered = firstNumber(row, [
    "queue_serviced_calls",
    "serviced",
    "answered",
    "calls_answered",
    "total_answered",
  ]);
  const missed = firstNumber(row, [
    "queue_unanswered_calls",
    "unanswered",
    "abandoned",
    "missed",
    "total_missed",
    "calls_missed",
  ]);
  return { label, received, answered, missed };
}

function toReportRow(row: CsvRow): ThreeCxReportRow {
  const queue = firstText(row, ["queue", "name"]);
  const extension = firstText(row, ["extension", "agent"]);
  const queueParts = splitNumberedLabel(queue);
  const extensionParts = splitNumberedLabel(extension);
  const isTotal = /^totals?$/i.test(queue);
  const isExtension = extension !== "";
  const level = isTotal ? "total" : isExtension ? "extension" : "queue";
  const received = isExtension ? null : firstNumber(row, ["queue_received_calls", "received", "calls_received"]) ?? 0;
  const queueServiced = firstNumber(row, ["queue_serviced_calls", "serviced", "answered", "calls_answered"]);
  const extensionServiced = firstNumber(row, ["extension_serviced_calls", "extension_serviced", "serviced"]);
  const serviced = isExtension ? extensionServiced ?? 0 : queueServiced ?? 0;
  const queueUnanswered = firstNumber(row, ["queue_unanswered_calls", "unanswered", "missed", "abandoned"]);
  const polls = isExtension ? firstNumber(row, ["extension_polls", "polls"]) ?? 0 : null;
  const unanswered = isExtension ? null : queueUnanswered ?? 0;
  const unansweredLabel = isExtension ? `${polls ?? 0} - Polls` : String(unanswered ?? 0);

  return {
    queue,
    queueNumber: isTotal ? "totals" : queueParts.number,
    queueName: isTotal ? "Totals" : queueParts.name,
    extension,
    extensionNumber: extensionParts.number || null,
    extensionName: extensionParts.name,
    label: isExtension ? extension : queue,
    level,
    received,
    serviced,
    unanswered,
    polls,
    unansweredLabel,
    talkTime: firstText(row, ["talk_time"]) || "00:00:00",
    averageTalkTime: firstText(row, ["average_talk_time"]) || "00:00:00",
    rawColumns: rawColumns(row),
    sourceLine: firstNumber(row, ["__source_line"]) ?? null,
    sortOrder: firstNumber(row, ["__sort_order"]) ?? null,
  };
}

function splitNumberedLabel(label: string): { number: string; name: string } {
  const trimmed = label.trim();
  const match = /^(\d+)\s+(.+)$/.exec(trimmed);
  if (!match) return { number: trimmed, name: trimmed };
  return { number: match[1]!, name: match[2]!.trim() };
}

function rawColumns(row: CsvRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith("__")) continue;
    out[key] = value;
  }
  return out;
}

function firstText(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) return value;
  }
  return "";
}

function firstNumber(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    const raw = row[key];
    if (raw === undefined || raw.trim() === "") continue;
    const parsed = Number(raw.replace(/,/g, "").replace(/%$/, "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function pickTotalRow(rows: NormalizedThreeCxRow[]): ThreeCxTotals | null {
  const total = rows.find((row) => /\btotal\b/i.test(row.label));
  if (!total || total.received === undefined) return null;
  const answered = total.answered ?? Math.max(0, total.received - (total.missed ?? 0));
  const missed = total.missed ?? Math.max(0, total.received - answered);
  return {
    received: total.received,
    answered,
    missed,
    answeredRate: total.received > 0 ? round1((answered / total.received) * 100) : 0,
    matchedRows: 1,
  };
}

function totalRows(rows: NormalizedThreeCxRow[]): ThreeCxTotals | null {
  const withReceived = rows.filter((row) => row.received !== undefined);
  const source = withReceived.length > 0 ? withReceived : rows.filter((row) => row.answered !== undefined || row.missed !== undefined);
  if (source.length === 0) return null;
  const received = sum(source.map((row) => row.received));
  const answered = sum(source.map((row) => row.answered));
  const missedRaw = sum(source.map((row) => row.missed));
  const missed = missedRaw > 0 ? missedRaw : Math.max(0, received - answered);
  return {
    received,
    answered,
    missed,
    answeredRate: received > 0 ? round1((answered / received) * 100) : 0,
    matchedRows: source.length,
  };
}

function sum(values: (number | undefined)[]) {
  return values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
