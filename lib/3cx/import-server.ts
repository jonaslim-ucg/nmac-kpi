import { createHash } from "node:crypto";
import {
  parseThreeCxReportText,
  reportDateRangeForMonth,
  threeCxRangeLabel,
  type ThreeCxCallMetrics,
  type ThreeCxReportRange,
  type ThreeCxReportRow,
} from "@/lib/3cx/email-report";
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
};

export type ThreeCxSavedImport = {
  ok: true;
  month: string;
  year: number;
  monthIndex: number;
  range: ThreeCxReportRange;
  rangeLabel: string;
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

function importHash(input: {
  text: string;
  source: ThreeCxImportSource;
  startDate: string;
  endDate: string;
  range: ThreeCxReportRange;
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

function queueMetricsFromRows(rows: ThreeCxReportRow[]): ThreeCxCallMetrics {
  const queueRows = rows.filter((row) => row.level === "queue");
  const received = queueRows.reduce((sum, row) => sum + (row.received ?? 0), 0);
  const answered = queueRows.reduce((sum, row) => sum + (row.serviced ?? 0), 0);
  const missed = queueRows.reduce((sum, row) => sum + (row.unanswered ?? 0), 0);
  return { received, answered, missed, answeredRate: received > 0 ? round1((answered / received) * 100) : 0 };
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
  range: ThreeCxReportRange;
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

export async function readDetailedReport(input: {
  year: number;
  monthIndex: number;
  range: ThreeCxReportRange;
}): Promise<{ rows: ThreeCxReportRow[]; metrics: ThreeCxCallMetrics | null; error?: string }> {
  const { startDate, endDate } = reportDateRangeForMonth(input.year, input.monthIndex, input.range);
  const supabase = createServiceRoleClient();
  const { data: queues, error: queueError } = await supabase
    .from("threecx_queue_report_rows")
    .select("id,queue_number,queue_name,total_calls,answered_calls,abandoned_calls,missed_calls")
    .eq("report_type", "queue_performance")
    .eq("report_start_date", startDate)
    .eq("report_end_date", endDate)
    .order("queue_number", { ascending: true });
  if (queueError) return { rows: [], metrics: null, error: queueError.message };

  const savedQueues = (queues ?? []) as SavedQueueRow[];
  const queueRows = savedQueues.map<ThreeCxReportRow>((row) => {
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
    if (extError) return { rows: queueRows, metrics: queueMetricsFromRows(queueRows), error: extError.message };
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

  return { rows: out, metrics: out.length > 0 ? queueMetricsFromRows(out) : null };
}

export async function saveThreeCxImport(input: {
  actor: ImportActor;
  year: number;
  monthIndex: number;
  range: ThreeCxReportRange;
  text: string;
  source: ThreeCxImportSource;
}): Promise<ThreeCxSavedImport> {
  const parsed = parseThreeCxReportText(input.text);
  const displayRows = parsed.rows.filter((row) => row.level !== "total");
  const { startDate, endDate } = reportDateRangeForMonth(input.year, input.monthIndex, input.range);
  await saveDetailedReport({
    actor: input.actor,
    text: input.text,
    source: input.source,
    range: input.range,
    startDate,
    endDate,
    rows: parsed.rows,
  });

  const current = await readNmacMasterMonth(input.year, input.monthIndex);
  if (current.error) throw new Error(current.error);
  const next = input.range === "month" ? mergeCallValues(current.data, parsed.values) : current.data;
  if (input.range === "month") {
    const saved = await writeNmacMasterMonth(input.year, input.monthIndex, next);
    if (saved.error) throw new Error(saved.error);
  }

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
    metrics: parsed.metrics,
    matchedRows: parsed.matchedRows,
  });

  return {
    ok: true,
    month,
    year: input.year,
    monthIndex: input.monthIndex,
    range: input.range,
    rangeLabel,
    metrics: parsed.metrics,
    values: next,
    matchedRows: parsed.matchedRows,
    source: input.source,
    rows: displayRows,
  };
}
