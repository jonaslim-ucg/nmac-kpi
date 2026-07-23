import { createHash } from "node:crypto";
import {
  parseThreeCxReportText,
  reportDateRangeForDate,
  reportDateRangeForMonth,
  threeCxRangeLabel,
  weeklyReportDateRangesForMonth,
  type ThreeCxCallMetrics,
  type ThreeCxImportRange,
  type ThreeCxReportRow,
} from "@/lib/3cx/email-report";
import { queueMetricsFromRows } from "@/lib/3cx/queue-metrics";
import { appendDevLog } from "@/lib/dev/logs";
import { MONTHS, type MonthDb } from "@/lib/kpi-nmac-2026/model";
import { readNmacMasterMonth, writeNmacMasterMonth } from "@/lib/kpi/write-server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type ImportActor = {
  email: string;
  role: string;
};

export type ThreeCxImportSource = {
  mode: "email" | "manual";
  subject?: string;
  receivedDateTime?: string;
  from?: string;
  attachmentName?: string;
  fileName?: string;
  messageId?: string;
  receivedLocalDate?: string;
  reportDate?: string;
  reportTimeZone?: string;
  pollTimeZone?: string;
};

export type ThreeCxSavedImport = {
  ok: true;
  month: string;
  year: number;
  monthIndex: number;
  range: ThreeCxImportRange;
  rangeLabel: string;
  reportStartDate: string;
  reportEndDate: string;
  metrics: ThreeCxCallMetrics;
  values: MonthDb;
  matchedRows: number;
  source: ThreeCxImportSource;
  rows: ThreeCxReportRow[];
};

type SavedQueueRow = {
  id: number;
  queue_number: string;
  queue_name: string;
  total_calls: number | null;
  answered_calls: number | null;
  abandoned_calls: number | null;
  missed_calls: number | null;
};

type SavedMonthlyQueueRow = SavedQueueRow & {
  report_start_date: string | null;
  report_end_date: string | null;
};

type SavedExtensionRow = {
  queue_report_row_id: number;
  queue_number: string;
  queue_name: string;
  extension_label: string;
  extension_number: string | null;
  extension_name: string;
  extension_serviced_calls: number | null;
  extension_polls: number | null;
  talk_time: string | null;
  average_talk_time: string | null;
  source_line: number | null;
  sort_order: number | null;
};

type SavedImportRow = {
  id: number;
  source: string;
  source_filename: string | null;
  source_message_id: string | null;
  report_type: string;
  report_start_date: string | null;
  report_end_date: string | null;
  row_count: number;
  extension_row_count: number;
};

type ExtensionAggregate = {
  queueNumber: string;
  queueName: string;
  extensionLabel: string;
  extensionNumber: string | null;
  extensionName: string;
  serviced: number;
  polls: number;
  talkSeconds: number;
  weightedAverageTalkSeconds: number;
  averageWeight: number;
  sourceLine: number | null;
  sortOrder: number | null;
};

const CALL_KPI_IDS = ["callvol", "call_answered", "call_missed", "callrate"] as const;

export function callMetricsFromMonth(values: MonthDb): ThreeCxCallMetrics {
  const received = values.callvol?.ty ?? 0;
  const answered = values.call_answered?.ty ?? 0;
  const missed = values.call_missed?.ty ?? 0;
  const answeredRate = values.callrate?.ty ?? (received > 0 ? round1((answered / received) * 100) : 0);
  return { received, answered, missed, answeredRate };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function mergeCallValues(current: MonthDb, imported: MonthDb): MonthDb {
  return {
    ...current,
    callvol: { ...current.callvol, ...imported.callvol },
    call_answered: { ...current.call_answered, ...imported.call_answered },
    call_missed: { ...current.call_missed, ...imported.call_missed },
    callrate: { ...current.callrate, ...imported.callrate },
  };
}

function callValuesFromMetrics(metrics: ThreeCxCallMetrics): MonthDb {
  return {
    callvol: { ty: metrics.received },
    call_answered: { ty: metrics.answered },
    call_missed: { ty: metrics.missed },
    callrate: { ty: metrics.answeredRate },
  };
}

function applyMonthlyCallMetrics(current: MonthDb, metrics: ThreeCxCallMetrics | null): MonthDb {
  const next: MonthDb = { ...current };
  for (const key of CALL_KPI_IDS) {
    delete next[key];
  }
  if (!metrics) return next;
  return mergeCallValues(next, callValuesFromMetrics(metrics));
}

function importMonthFromDateKey(value: string | null): { year: number; monthIndex: number } | null {
  if (!value) return null;
  const [yearRaw, monthRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
}

function importHash(input: {
  text: string;
  source: ThreeCxImportSource;
  startDate: string;
  endDate: string;
  range: ThreeCxImportRange;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        reportType: "queue_performance",
        startDate: input.startDate,
        endDate: input.endDate,
        range: input.range,
        source: input.source,
      }),
    )
    .update(input.text)
    .digest("hex");
}

function parentQueueKey(row: ThreeCxReportRow) {
  return row.queueNumber || row.queue;
}

function numericRaw(row: ThreeCxReportRow, key: string): number | null {
  const raw = row.rawColumns[key];
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function durationToSeconds(value: string | null | undefined): number {
  if (!value) return 0;
  const parts = value.trim().split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export async function logThreeCxImport(
  actor: ImportActor,
  level: "info" | "warn" | "error",
  message: string,
  context: Record<string, unknown>,
) {
  const result = await appendDevLog({
    level,
    source: "integrations.3cx",
    message,
    createdByEmail: actor.email,
    context: { role: actor.role, ...context },
  });
  if (result.error && !result.setupRequired) {
    console.error("[3cx-import-log]", result.error);
  }
}

async function saveDetailedReport(input: {
  actor: ImportActor;
  text: string;
  source: ThreeCxImportSource;
  range: ThreeCxImportRange;
  startDate: string;
  endDate: string;
  rows: ThreeCxReportRow[];
}) {
  const supabase = createServiceRoleClient();
  const queueRows = input.rows.filter((row) => row.level === "queue");
  const extensionRows = input.rows.filter((row) => row.level === "extension");
  const source = input.source.mode === "email" ? "email" : "manual_upload";
  const hash = importHash(input);

  const { data: importRow, error: importError } = await supabase
    .from("threecx_queue_report_imports")
    .upsert(
      {
        import_hash: hash,
        source,
        source_filename: input.source.fileName ?? input.source.attachmentName ?? null,
        source_message_id: input.source.messageId ?? null,
        report_type: "queue_performance",
        report_start_date: input.startDate,
        report_end_date: input.endDate,
        row_count: queueRows.length,
        extension_row_count: extensionRows.length,
        imported_by_email: input.actor.email,
      },
      { onConflict: "import_hash" },
    )
    .select("id")
    .single();
  if (importError || !importRow) throw new Error(importError?.message ?? "Could not save 3CX import.");

  const importId = (importRow as { id: number }).id;
  const queuePayload = queueRows.map((row) => {
    const unanswered = row.unanswered ?? null;
    return {
      import_id: importId,
      report_type: "queue_performance",
      report_start_date: input.startDate,
      report_end_date: input.endDate,
      queue_number: row.queueNumber || row.queue,
      queue_name: row.queueName || row.queue,
      total_calls: row.received,
      answered_calls: row.serviced,
      abandoned_calls: unanswered,
      missed_calls: unanswered,
      callback_calls: null,
      answer_rate: row.received && row.serviced !== null ? round1((row.serviced / row.received) * 100) : null,
      service_level: null,
      raw_columns: row.rawColumns,
    };
  });

  let savedQueues: SavedQueueRow[] = [];
  if (queuePayload.length > 0) {
    const { data, error } = await supabase
      .from("threecx_queue_report_rows")
      .upsert(queuePayload, { onConflict: "report_type,report_start_date,report_end_date,queue_number" })
      .select("id,queue_number,queue_name,total_calls,answered_calls,abandoned_calls,missed_calls");
    if (error) throw new Error(error.message);
    savedQueues = (data ?? []) as SavedQueueRow[];
  }

  const queueIdByNumber = new Map(savedQueues.map((row) => [row.queue_number, row.id]));
  const extensionPayload = extensionRows
    .map((row) => {
      const queueNumber = parentQueueKey(row);
      const queueReportRowId = queueIdByNumber.get(queueNumber);
      if (!queueReportRowId) return null;
      return {
        queue_report_row_id: queueReportRowId,
        import_id: importId,
        report_type: "queue_performance",
        report_start_date: input.startDate,
        report_end_date: input.endDate,
        queue_number: queueNumber,
        queue_name: row.queueName || row.queue,
        extension_label: row.extension || row.label,
        extension_number: row.extensionNumber,
        extension_name: row.extensionName || row.extension || row.label,
        queue_received_calls: numericRaw(row, "queue_received_calls"),
        queue_serviced_calls: numericRaw(row, "queue_serviced_calls"),
        queue_unanswered_calls: numericRaw(row, "queue_unanswered_calls"),
        extension_serviced_calls: row.serviced,
        extension_polls: row.polls,
        talk_time: row.talkTime,
        average_talk_time: row.averageTalkTime,
        raw_columns: row.rawColumns,
        source_line: row.sourceLine,
        sort_order: row.sortOrder,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (extensionPayload.length > 0) {
    const { error } = await supabase
      .from("threecx_queue_report_extension_rows")
      .upsert(extensionPayload, {
        onConflict: "report_type,report_start_date,report_end_date,queue_number,extension_label",
      });
    if (error) throw new Error(error.message);
  }

  return { importId, hash };
}

function reportRangeKey(row: { report_start_date: string | null; report_end_date: string | null }) {
  return `${row.report_start_date}|${row.report_end_date}`;
}

function isDailyReportRow(row: { report_start_date: string | null; report_end_date: string | null }) {
  return Boolean(row.report_start_date && row.report_start_date === row.report_end_date);
}

function dateKeysInRange(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return [];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const out: string[] = [];
  for (let time = start.getTime(); time <= end.getTime(); time += 24 * 60 * 60 * 1000) {
    out.push(new Date(time).toISOString().slice(0, 10));
  }
  return out;
}

function reportOverlapsAnyDate(row: { report_start_date: string | null; report_end_date: string | null }, dates: Set<string>) {
  return dateKeysInRange(row.report_start_date, row.report_end_date).some((date) => dates.has(date));
}

async function readAggregatedDetailedReportFromQueues(
  savedQueues: SavedMonthlyQueueRow[],
  reportStartDate: string,
): Promise<{ rows: ThreeCxReportRow[]; metrics: ThreeCxCallMetrics | null; error?: string }> {
  if (savedQueues.length === 0) return { rows: [], metrics: null };
  const supabase = createServiceRoleClient();
  const queueByNumber = new Map<string, SavedQueueRow>();
  for (const row of savedQueues) {
    const key = row.queue_number;
    const current = queueByNumber.get(key);
    const missed = row.missed_calls ?? row.abandoned_calls ?? 0;
    if (!current) {
      queueByNumber.set(key, {
        id: row.id,
        queue_number: row.queue_number,
        queue_name: row.queue_name,
        total_calls: row.total_calls ?? 0,
        answered_calls: row.answered_calls ?? 0,
        abandoned_calls: missed,
        missed_calls: missed,
      });
      continue;
    }
    current.total_calls = (current.total_calls ?? 0) + (row.total_calls ?? 0);
    current.answered_calls = (current.answered_calls ?? 0) + (row.answered_calls ?? 0);
    current.abandoned_calls = (current.abandoned_calls ?? 0) + missed;
    current.missed_calls = (current.missed_calls ?? 0) + missed;
  }

  const queueIds = savedQueues.map((row) => row.id);
  let extensionRows: SavedExtensionRow[] = [];
  if (queueIds.length > 0) {
    const { data: exts, error: extError } = await supabase
      .from("threecx_queue_report_extension_rows")
      .select(
        "queue_report_row_id,queue_number,queue_name,extension_label,extension_number,extension_name,extension_serviced_calls,extension_polls,talk_time,average_talk_time,source_line,sort_order",
      )
      .in("queue_report_row_id", queueIds)
      .order("sort_order", { ascending: true });
    if (extError) {
      const queueRows = queueRowsFromSavedRows([...queueByNumber.values()]);
      return { rows: queueRows, metrics: queueMetricsFromRows(queueRows, reportStartDate), error: extError.message };
    }
    extensionRows = (exts ?? []) as SavedExtensionRow[];
  }

  const extensionsByQueue = new Map<string, ExtensionAggregate[]>();
  for (const row of extensionRows) {
    const queueNumber = row.queue_number;
    const key = `${queueNumber}|${row.extension_label}`;
    const existing = extensionsByQueue.get(queueNumber)?.find((item) => `${item.queueNumber}|${item.extensionLabel}` === key);
    const serviced = row.extension_serviced_calls ?? 0;
    const averageSeconds = durationToSeconds(row.average_talk_time);
    if (existing) {
      existing.serviced += serviced;
      existing.polls += row.extension_polls ?? 0;
      existing.talkSeconds += durationToSeconds(row.talk_time);
      existing.weightedAverageTalkSeconds += averageSeconds * serviced;
      existing.averageWeight += serviced;
      existing.sourceLine = existing.sourceLine ?? row.source_line;
      existing.sortOrder = Math.min(existing.sortOrder ?? row.sort_order ?? 0, row.sort_order ?? existing.sortOrder ?? 0);
      continue;
    }

    const aggregate: ExtensionAggregate = {
      queueNumber,
      queueName: row.queue_name,
      extensionLabel: row.extension_label,
      extensionNumber: row.extension_number,
      extensionName: row.extension_name,
      serviced,
      polls: row.extension_polls ?? 0,
      talkSeconds: durationToSeconds(row.talk_time),
      weightedAverageTalkSeconds: averageSeconds * serviced,
      averageWeight: serviced,
      sourceLine: row.source_line,
      sortOrder: row.sort_order,
    };
    const list = extensionsByQueue.get(queueNumber) ?? [];
    list.push(aggregate);
    extensionsByQueue.set(queueNumber, list);
  }

  const out: ThreeCxReportRow[] = [];
  const queueRows = [...queueByNumber.values()].sort((a, b) => a.queue_number.localeCompare(b.queue_number));
  for (const queue of queueRows) {
    const queueRow = queueRowsFromSavedRows([queue])[0];
    if (queueRow) out.push(queueRow);
    const extensions = (extensionsByQueue.get(queue.queue_number) ?? []).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.extensionLabel.localeCompare(b.extensionLabel),
    );
    for (const ext of extensions) {
      const averageSeconds =
        ext.serviced > 0 && ext.talkSeconds > 0
          ? ext.talkSeconds / ext.serviced
          : ext.averageWeight > 0
            ? ext.weightedAverageTalkSeconds / ext.averageWeight
            : 0;
      out.push({
        queue: `${ext.queueNumber} ${ext.queueName}`.trim(),
        queueNumber: ext.queueNumber,
        queueName: ext.queueName,
        extension: ext.extensionLabel,
        extensionNumber: ext.extensionNumber,
        extensionName: ext.extensionName,
        label: ext.extensionLabel,
        level: "extension",
        received: null,
        serviced: ext.serviced,
        unanswered: null,
        polls: ext.polls,
        unansweredLabel: `${ext.polls} - Polls`,
        talkTime: formatDuration(ext.talkSeconds),
        averageTalkTime: formatDuration(averageSeconds),
        rawColumns: {},
        sourceLine: ext.sourceLine,
        sortOrder: ext.sortOrder,
      });
    }
  }

  return { rows: out, metrics: queueMetricsFromRows(out, reportStartDate) };
}

async function readMonthlyDetailedReport(input: {
  year: number;
  monthIndex: number;
}): Promise<{ rows: ThreeCxReportRow[]; metrics: ThreeCxCallMetrics | null; error?: string }> {
  const weeklyRanges = weeklyReportDateRangesForMonth(input.year, input.monthIndex);
  const weeklyRangeKeys = new Set(weeklyRanges.map((range) => `${range.startDate}|${range.endDate}`));
  const monthRange = reportDateRangeForMonth(input.year, input.monthIndex, "month");
  const supabase = createServiceRoleClient();

  const { data: queues, error: queueError } = await supabase
    .from("threecx_queue_report_rows")
    .select(
      "id,queue_number,queue_name,total_calls,answered_calls,abandoned_calls,missed_calls,report_start_date,report_end_date",
    )
    .eq("report_type", "queue_performance")
    .gte("report_start_date", monthRange.startDate)
    .lte("report_end_date", monthRange.endDate)
    .order("queue_number", { ascending: true });
  if (queueError) return { rows: [], metrics: null, error: queueError.message };

  const allQueues = (queues ?? []) as SavedMonthlyQueueRow[];
  const dailyQueues = allQueues.filter(isDailyReportRow);
  const dailyDates = new Set(dailyQueues.flatMap((row) => dateKeysInRange(row.report_start_date, row.report_end_date)));
  const weeklyQueues = allQueues.filter(
    (row) => weeklyRangeKeys.has(reportRangeKey(row)) && !reportOverlapsAnyDate(row, dailyDates),
  );
  return readAggregatedDetailedReportFromQueues([...weeklyQueues, ...dailyQueues], monthRange.startDate);
}

function queueRowsFromSavedRows(rows: SavedQueueRow[]): ThreeCxReportRow[] {
  return rows.map<ThreeCxReportRow>((row) => {
    const missed = row.missed_calls ?? row.abandoned_calls ?? null;
    return {
      queue: `${row.queue_number} ${row.queue_name}`.trim(),
      queueNumber: row.queue_number,
      queueName: row.queue_name,
      extension: "",
      extensionNumber: null,
      extensionName: "",
      label: `${row.queue_number} ${row.queue_name}`.trim(),
      level: "queue",
      received: row.total_calls,
      serviced: row.answered_calls,
      unanswered: missed,
      polls: null,
      unansweredLabel: missed === null ? "" : String(missed),
      talkTime: "00:00:00",
      averageTalkTime: "00:00:00",
      rawColumns: {},
      sourceLine: null,
      sortOrder: null,
    };
  });
}

export async function readDetailedReport(input: {
  year: number;
  monthIndex: number;
  range: ThreeCxImportRange;
  day?: number;
}): Promise<{ rows: ThreeCxReportRow[]; metrics: ThreeCxCallMetrics | null; error?: string }> {
  if (input.range === "month") {
    return readMonthlyDetailedReport(input);
  }

  let startDate: string;
  let endDate: string;
  try {
    const range =
      input.range === "day"
        ? reportDateRangeForDate(input.year, input.monthIndex, input.day ?? 0)
        : reportDateRangeForMonth(input.year, input.monthIndex, input.range);
    startDate = range.startDate;
    endDate = range.endDate;
  } catch (error) {
    return { rows: [], metrics: null, error: error instanceof Error ? error.message : "Choose a valid 3CX report date." };
  }

  const supabase = createServiceRoleClient();
  const { data: queues, error: queueError } = await supabase
    .from("threecx_queue_report_rows")
    .select(
      "id,queue_number,queue_name,total_calls,answered_calls,abandoned_calls,missed_calls,report_start_date,report_end_date",
    )
    .eq("report_type", "queue_performance")
    .gte("report_start_date", startDate)
    .lte("report_end_date", endDate)
    .order("queue_number", { ascending: true });
  if (queueError) return { rows: [], metrics: null, error: queueError.message };

  const allQueues = (queues ?? []) as SavedMonthlyQueueRow[];
  if (input.range === "day") {
    const savedQueues = allQueues.filter((row) => row.report_start_date === startDate && row.report_end_date === endDate);
    return readAggregatedDetailedReportFromQueues(savedQueues, startDate);
  }

  const dailyQueues = allQueues.filter(isDailyReportRow);
  if (dailyQueues.length > 0) return readAggregatedDetailedReportFromQueues(dailyQueues, startDate);

  const savedQueues = allQueues.filter((row) => row.report_start_date === startDate && row.report_end_date === endDate);
  const queueRows = queueRowsFromSavedRows(savedQueues);

  const queueIds = savedQueues.map((row) => row.id);
  let extensionRows: SavedExtensionRow[] = [];
  if (queueIds.length > 0) {
    const { data: exts, error: extError } = await supabase
      .from("threecx_queue_report_extension_rows")
      .select(
        "queue_report_row_id,queue_number,queue_name,extension_label,extension_number,extension_name,extension_serviced_calls,extension_polls,talk_time,average_talk_time,source_line,sort_order",
      )
      .in("queue_report_row_id", queueIds)
      .order("sort_order", { ascending: true });
    if (extError) {
      return { rows: queueRows, metrics: queueMetricsFromRows(queueRows, startDate), error: extError.message };
    }
    extensionRows = (exts ?? []) as SavedExtensionRow[];
  }

  const childrenByQueueId = new Map<number, SavedExtensionRow[]>();
  for (const row of extensionRows) {
    const list = childrenByQueueId.get(row.queue_report_row_id) ?? [];
    list.push(row);
    childrenByQueueId.set(row.queue_report_row_id, list);
  }

  const out: ThreeCxReportRow[] = [];
  for (const queue of savedQueues) {
    const queueRow = queueRows.find((row) => row.queueNumber === queue.queue_number);
    if (queueRow) out.push(queueRow);
    for (const ext of childrenByQueueId.get(queue.id) ?? []) {
      out.push({
        queue: `${ext.queue_number} ${ext.queue_name}`.trim(),
        queueNumber: ext.queue_number,
        queueName: ext.queue_name,
        extension: ext.extension_label,
        extensionNumber: ext.extension_number,
        extensionName: ext.extension_name,
        label: ext.extension_label,
        level: "extension",
        received: null,
        serviced: ext.extension_serviced_calls,
        unanswered: null,
        polls: ext.extension_polls,
        unansweredLabel: `${ext.extension_polls ?? 0} - Polls`,
        talkTime: ext.talk_time ?? "00:00:00",
        averageTalkTime: ext.average_talk_time ?? "00:00:00",
        rawColumns: {},
        sourceLine: ext.source_line,
        sortOrder: ext.sort_order,
      });
    }
  }

  return { rows: out, metrics: out.length > 0 ? queueMetricsFromRows(out, startDate) : null };
}

export async function readDetailedReportForDateRange(input: {
  startDate: string;
  endDate: string;
}): Promise<{ rows: ThreeCxReportRow[]; metrics: ThreeCxCallMetrics | null; error?: string }> {
  const supabase = createServiceRoleClient();
  const { data: queues, error: queueError } = await supabase
    .from("threecx_queue_report_rows")
    .select(
      "id,queue_number,queue_name,total_calls,answered_calls,abandoned_calls,missed_calls,report_start_date,report_end_date",
    )
    .eq("report_type", "queue_performance")
    .gte("report_start_date", input.startDate)
    .lte("report_end_date", input.endDate)
    .order("report_start_date", { ascending: true })
    .order("queue_number", { ascending: true });
  if (queueError) return { rows: [], metrics: null, error: queueError.message };

  const dailyQueues = ((queues ?? []) as SavedMonthlyQueueRow[]).filter(isDailyReportRow);
  return readAggregatedDetailedReportFromQueues(dailyQueues, input.startDate);
}

async function syncMonthlyCallValuesFromSavedImports(year: number, monthIndex: number): Promise<{ values: MonthDb; error?: string }> {
  const [current, detailed] = await Promise.all([
    readNmacMasterMonth(year, monthIndex),
    readDetailedReport({ year, monthIndex, range: "month" }),
  ]);
  if (current.error) return { values: {}, error: current.error };
  if (detailed.error) return { values: current.data, error: detailed.error };

  const next = applyMonthlyCallMetrics(current.data, detailed.metrics);
  const saved = await writeNmacMasterMonth(year, monthIndex, next);
  if (saved.error) return { values: next, error: saved.error };
  return { values: next };
}

export async function deleteThreeCxImport(
  actor: ImportActor,
  importId: number,
): Promise<{
  ok: boolean;
  deleted?: { importId: number; queueRows: number; extensionRows: number; fileLabel: string };
  notFound?: boolean;
  error?: string;
}> {
  const supabase = createServiceRoleClient();
  const { data: importRow, error: lookupError } = await supabase
    .from("threecx_queue_report_imports")
    .select(
      [
        "id",
        "source",
        "source_filename",
        "source_message_id",
        "report_type",
        "report_start_date",
        "report_end_date",
        "row_count",
        "extension_row_count",
      ].join(","),
    )
    .eq("id", importId)
    .maybeSingle();

  if (lookupError) return { ok: false, error: lookupError.message };
  if (!importRow) return { ok: false, notFound: true, error: "3CX import was not found." };

  const row = importRow as unknown as SavedImportRow;
  const { count: extensionRows, error: extensionError } = await supabase
    .from("threecx_queue_report_extension_rows")
    .delete({ count: "exact" })
    .eq("import_id", importId);
  if (extensionError) return { ok: false, error: extensionError.message };

  const { count: queueRows, error: queueError } = await supabase
    .from("threecx_queue_report_rows")
    .delete({ count: "exact" })
    .eq("import_id", importId);
  if (queueError) return { ok: false, error: queueError.message };

  const { error: importError } = await supabase.from("threecx_queue_report_imports").delete().eq("id", importId);
  if (importError) return { ok: false, error: importError.message };

  const deletedPeriod = importMonthFromDateKey(row.report_start_date);
  let syncError: string | undefined;
  if (deletedPeriod) {
    const synced = await syncMonthlyCallValuesFromSavedImports(deletedPeriod.year, deletedPeriod.monthIndex);
    syncError = synced.error;
  }

  const fileLabel = row.source_filename || row.source_message_id || `Import #${importId}`;
  await logThreeCxImport(actor, "info", "Deleted 3CX import", {
    importId,
    fileLabel,
    source: row.source,
    reportType: row.report_type,
    reportStartDate: row.report_start_date,
    reportEndDate: row.report_end_date,
    queueRows: queueRows ?? 0,
    extensionRows: extensionRows ?? 0,
    originalQueueRows: row.row_count,
    originalExtensionRows: row.extension_row_count,
    syncError,
  });

  return {
    ok: true,
    deleted: {
      importId,
      queueRows: queueRows ?? 0,
      extensionRows: extensionRows ?? 0,
      fileLabel,
    },
  };
}

export async function saveThreeCxImport(input: {
  actor: ImportActor;
  year: number;
  monthIndex: number;
  range: ThreeCxImportRange;
  day?: number;
  text: string;
  source: ThreeCxImportSource;
}): Promise<ThreeCxSavedImport> {
  const parsed = parseThreeCxReportText(input.text);
  const displayRows = parsed.rows.filter((row) => row.level !== "total");
  if (input.range === "day" && !Number.isInteger(input.day)) {
    throw new Error("Choose a valid 3CX report date.");
  }
  const { startDate, endDate } =
    input.range === "day"
      ? reportDateRangeForDate(input.year, input.monthIndex, input.day as number)
      : reportDateRangeForMonth(input.year, input.monthIndex, input.range);
  const metrics = queueMetricsFromRows(displayRows, startDate);
  await saveDetailedReport({
    actor: input.actor,
    text: input.text,
    source: input.source,
    range: input.range,
    startDate,
    endDate,
    rows: parsed.rows,
  });

  const synced = await syncMonthlyCallValuesFromSavedImports(input.year, input.monthIndex);
  if (synced.error) throw new Error(synced.error);
  const next = synced.values;

  const month = MONTHS[input.monthIndex] ?? `Month ${input.monthIndex + 1}`;
  const rangeLabel = threeCxRangeLabel(input.range);
  const fileLabel = input.source.fileName || input.source.attachmentName || input.source.subject || "3CX report";
  await logThreeCxImport(input.actor, "info", `Imported 3CX ${rangeLabel} for ${month} ${input.year}`, {
    year: input.year,
    monthIndex: input.monthIndex,
    month,
    range: input.range,
    rangeLabel,
    reportStartDate: startDate,
    reportEndDate: endDate,
    source: input.source,
    fileLabel,
    metrics,
    matchedRows: parsed.matchedRows,
  });

  return {
    ok: true,
    month,
    year: input.year,
    monthIndex: input.monthIndex,
    range: input.range,
    rangeLabel,
    reportStartDate: startDate,
    reportEndDate: endDate,
    metrics,
    values: next,
    matchedRows: parsed.matchedRows,
    source: input.source,
    rows: displayRows,
  };
}
