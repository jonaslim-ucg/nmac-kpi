"use client";

import { ChevronDown, ChevronRight, FileUp, Loader2, MailSearch, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Snackbar, type SnackbarVariant } from "@/components/ui/snackbar";
import { useSession } from "@/components/auth/session-provider";
import { canAccessDev } from "@/lib/auth/types";
import { DEFAULT_KPI_YEAR, SUPPORTED_KPI_YEARS } from "@/lib/kpi/years";
import { defaultCompletedMonthIndex, MONTHS } from "@/lib/kpi-nmac-2026/model";

type ThreeCxRange = "month" | "week1" | "week2" | "week3" | "week4" | "week5";
type BusyAction = "email" | "manual" | "logs" | null;

const WEEK_FILTERS: { value: ThreeCxRange; label: string }[] = [
  { value: "month", label: "Whole month" },
  { value: "week1", label: "1st week" },
  { value: "week2", label: "2nd week" },
  { value: "week3", label: "3rd week" },
  { value: "week4", label: "4th week" },
  { value: "week5", label: "5th week" },
];

type ThreeCxImportResponse = {
  ok?: boolean;
  error?: string;
  month?: string;
  year?: number;
  monthIndex?: number;
  range?: ThreeCxRange;
  rangeLabel?: string;
  metrics?: {
    received: number;
    answered: number;
    missed: number;
    answeredRate: number;
  };
  source?: {
    subject?: string;
    attachmentName?: string;
  };
  rows?: ThreeCxReportRow[];
  matchedRows?: number;
};

type ThreeCxMetrics = NonNullable<ThreeCxImportResponse["metrics"]>;

type ThreeCxReportRow = {
  queue: string;
  extension: string;
  label: string;
  level: "queue" | "extension" | "total";
  received: number | null;
  serviced: number | null;
  unanswered: number | null;
  polls: number | null;
  unansweredLabel: string;
  talkTime: string;
  averageTalkTime: string;
};

type ThreeCxValuesResponse = {
  ok?: boolean;
  error?: string;
  metrics?: ThreeCxMetrics;
  rows?: ThreeCxReportRow[];
};

type ThreeCxLogEntry = {
  id: number;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  source: string | null;
  context: Record<string, unknown> | null;
  created_by_email: string | null;
  created_at: string;
};

type DevLogsResponse = {
  logs?: ThreeCxLogEntry[];
  error?: string;
  setupRequired?: boolean;
};

type ThreeCxImportRecord = {
  id: number;
  source: string;
  source_filename: string | null;
  source_message_id: string | null;
  report_type: string;
  report_start_date: string | null;
  report_end_date: string | null;
  row_count: number;
  extension_row_count: number;
  imported_by_email: string | null;
  imported_at: string;
};

type ThreeCxImportsResponse = {
  ok?: boolean;
  imports?: ThreeCxImportRecord[];
  error?: string;
};

type DeleteThreeCxImportResponse = {
  ok?: boolean;
  error?: string;
  deleted?: {
    fileLabel?: string;
    queueRows?: number;
    extensionRows?: number;
  };
};

function formatLogTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateOnly(value: string | null) {
  if (!value) return "Not set";
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatImportRange(row: ThreeCxImportRecord) {
  const start = formatDateOnly(row.report_start_date);
  const end = formatDateOnly(row.report_end_date);
  return start === end ? start : `${start} - ${end}`;
}

function formatImportSource(row: ThreeCxImportRecord) {
  if (row.source === "email") return "Email";
  if (row.source === "manual_upload") return "Manual CSV";
  return row.source.replace(/_/g, " ");
}

function formatImportFile(row: ThreeCxImportRecord) {
  return row.source_filename || row.source_message_id || `Import #${row.id}`;
}

function rangeLabel(value: ThreeCxRange) {
  return WEEK_FILTERS.find((filter) => filter.value === value)?.label ?? "Whole month";
}

function dateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function reportRangeDates(year: number, monthIndex: number, value: ThreeCxRange) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  if (value === "month") return { startDate: dateKey(year, monthIndex, 1), endDate: dateKey(year, monthIndex, lastDay) };
  if (value === "week5") return { startDate: dateKey(year, monthIndex, 29), endDate: dateKey(year, monthIndex, lastDay) };
  if (value === "week4") {
    const endDay = lastDay > 28 ? 28 : lastDay;
    return { startDate: dateKey(year, monthIndex, 22), endDate: dateKey(year, monthIndex, endDay) };
  }
  const weekNumber = value === "week1" ? 1 : value === "week2" ? 2 : 3;
  const startDay = 1 + (weekNumber - 1) * 7;
  return { startDate: dateKey(year, monthIndex, startDay), endDate: dateKey(year, monthIndex, startDay + 6) };
}

function hasImportForRange(imports: ThreeCxImportRecord[], year: number, monthIndex: number, value: ThreeCxRange) {
  const { startDate, endDate } = reportRangeDates(year, monthIndex, value);
  return imports.some(
    (item) =>
      item.report_start_date === startDate &&
      item.report_end_date === endDate &&
      item.row_count + item.extension_row_count > 0,
  );
}

function sourceLabel(context: Record<string, unknown> | null) {
  const source = context?.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return "";
  const s = source as Record<string, unknown>;
  const mode = s.mode === "manual" ? "Manual CSV" : s.mode === "email" ? "Email" : "";
  const file = typeof s.fileName === "string" ? s.fileName : typeof s.attachmentName === "string" ? s.attachmentName : "";
  return [mode, file].filter(Boolean).join(" · ");
}

function metricLabel(context: Record<string, unknown> | null) {
  const metrics = context?.metrics;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return "";
  const m = metrics as Record<string, unknown>;
  const received = typeof m.received === "number" ? m.received : null;
  const answered = typeof m.answered === "number" ? m.answered : null;
  const missed = typeof m.missed === "number" ? m.missed : null;
  const rate = typeof m.answeredRate === "number" ? m.answeredRate : null;
  if (received === null || answered === null || missed === null || rate === null) return "";
  return `${received.toLocaleString()} received · ${answered.toLocaleString()} answered · ${missed.toLocaleString()} missed · ${rate}%`;
}

function fallbackReportRows(metrics: ThreeCxMetrics | null): ThreeCxReportRow[] {
  if (!metrics) return [];
  return [
    {
      queue: "Totals",
      extension: "",
      label: "Totals",
      level: "total",
      received: metrics.received,
      serviced: metrics.answered,
      unanswered: metrics.missed,
      polls: null,
      unansweredLabel: String(metrics.missed),
      talkTime: "00:00:00",
      averageTalkTime: "00:00:00",
    },
  ];
}

function queueHasChildren(rows: ThreeCxReportRow[], index: number) {
  const row = rows[index];
  if (!row || row.level !== "queue") return false;
  return rows[index + 1]?.level === "extension";
}

function queueKey(row: ThreeCxReportRow) {
  return row.queue || row.label;
}

function visibleReportRows(rows: ThreeCxReportRow[], expandedQueues: Set<string>) {
  let activeQueue = "";
  return rows.filter((row) => {
    if (row.level === "queue") {
      activeQueue = queueKey(row);
      return true;
    }
    if (row.level === "extension") {
      return expandedQueues.has(activeQueue);
    }
    return true;
  });
}

function timeHasData(value: string) {
  const clean = value.trim();
  return clean !== "" && clean !== "00:00:00" && clean !== "0:00:00";
}

function rowHasData(row: ThreeCxReportRow) {
  return (
    (row.received ?? 0) > 0 ||
    (row.serviced ?? 0) > 0 ||
    (row.unanswered ?? 0) > 0 ||
    (row.polls ?? 0) > 0 ||
    timeHasData(row.talkTime) ||
    timeHasData(row.averageTalkTime)
  );
}

function dataOnlyReportRows(rows: ThreeCxReportRow[]) {
  const out: ThreeCxReportRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    if (row.level === "queue") {
      const childRows: ThreeCxReportRow[] = [];
      let childIndex = index + 1;
      while (rows[childIndex]?.level === "extension") {
        const child = rows[childIndex];
        if (child && rowHasData(child)) childRows.push(child);
        childIndex += 1;
      }
      if (rowHasData(row) || childRows.length > 0) out.push(row, ...childRows);
      index = childIndex - 1;
      continue;
    }
    if (row.level === "extension" && rowHasData(row)) out.push(row);
    if (row.level === "total" && rowHasData(row)) out.push(row);
  }
  return out;
}

function formatCount(value: number | null) {
  return value === null ? "" : value.toLocaleString();
}

export function ThreeCxEmailImportPanel() {
  const { user, loading } = useSession();
  const [year, setYear] = useState(DEFAULT_KPI_YEAR);
  const [monthIndex, setMonthIndex] = useState(defaultCompletedMonthIndex);
  const [range, setRange] = useState<ThreeCxRange>("month");
  const [manualRangeDraft, setManualRangeDraft] = useState<ThreeCxRange>("week1");
  const [manualRange, setManualRange] = useState<ThreeCxRange>("week1");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [logs, setLogs] = useState<ThreeCxLogEntry[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [imports, setImports] = useState<ThreeCxImportRecord[]>([]);
  const [importsLoading, setImportsLoading] = useState(false);
  const [importsError, setImportsError] = useState<string | null>(null);
  const [currentMetrics, setCurrentMetrics] = useState<ThreeCxMetrics | null>(null);
  const [reportRows, setReportRows] = useState<ThreeCxReportRow[]>([]);
  const [expandedQueues, setExpandedQueues] = useState<Set<string>>(() => new Set());
  const [valuesLoading, setValuesLoading] = useState(false);
  const [valuesError, setValuesError] = useState<string | null>(null);
  const [deletingImportId, setDeletingImportId] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<{ text: string; variant: SnackbarVariant } | null>(null);
  const disabled = busy !== null || deletingImportId !== null;

  const showSnackbar = useCallback((text: string, variant: SnackbarVariant) => {
    setSnackbar({ text, variant });
  }, []);

  const applyReportRows = useCallback((rows: ThreeCxReportRow[]) => {
    setReportRows(rows);
    setExpandedQueues(new Set());
  }, []);

  const visibleWeekFilters = useMemo(
    () =>
      WEEK_FILTERS.filter(
        (filter) => filter.value === "month" || hasImportForRange(imports, year, monthIndex, filter.value),
      ),
    [imports, monthIndex, year],
  );
  const activeRange = visibleWeekFilters.some((filter) => filter.value === range) ? range : "month";
  const manualRangeFilters = useMemo(() => {
    const hasFifthWeek = new Date(year, monthIndex + 1, 0).getDate() > 28;
    return WEEK_FILTERS.filter((filter) => filter.value !== "month" && (filter.value !== "week5" || hasFifthWeek));
  }, [monthIndex, year]);
  const selectedManualRange = manualRangeFilters.some((filter) => filter.value === manualRange) ? manualRange : "week1";
  const selectedManualRangeDraft = manualRangeFilters.some((filter) => filter.value === manualRangeDraft)
    ? manualRangeDraft
    : "week1";

  const loadLogs = useCallback(async () => {
    if (!canAccessDev(user?.role)) return;
    setBusy((prev) => prev ?? "logs");
    setLogsError(null);
    try {
      const res = await fetch("/api/dev/logs?limit=200", { credentials: "include" });
      const payload = (await res.json()) as DevLogsResponse;
      if (!res.ok) {
        setLogsError(payload.error ?? "Could not load logs.");
        return;
      }
      const rows = (payload.logs ?? []).filter((log) => log.source === "integrations.3cx").slice(0, 12);
      setLogs(rows);
      if (payload.setupRequired) setLogsError(payload.error ?? "Run the developer logs setup SQL.");
    } catch (error) {
      setLogsError(error instanceof Error ? error.message : "Could not load logs.");
    } finally {
      setBusy((prev) => (prev === "logs" ? null : prev));
    }
  }, [user?.role]);

  const loadImports = useCallback(async () => {
    if (!canAccessDev(user?.role)) return;
    setImportsLoading(true);
    setImportsError(null);
    try {
      const params = new URLSearchParams({ year: String(year), monthIndex: String(monthIndex), limit: "100" });
      const res = await fetch(`/api/integrations/3cx/imports?${params.toString()}`, { credentials: "include" });
      const payload = (await res.json()) as ThreeCxImportsResponse;
      if (!res.ok || !payload.ok) {
        setImportsError(payload.error ?? "Could not load saved 3CX imports.");
        return;
      }
      setImports(payload.imports ?? []);
    } catch (error) {
      setImportsError(error instanceof Error ? error.message : "Could not load saved 3CX imports.");
    } finally {
      setImportsLoading(false);
    }
  }, [monthIndex, user?.role, year]);

  const loadCurrentValues = useCallback(async (rangeOverride?: ThreeCxRange) => {
    if (!canAccessDev(user?.role)) return;
    const requestedRange = rangeOverride ?? activeRange;
    setValuesLoading(true);
    setValuesError(null);
    try {
      const params = new URLSearchParams({ year: String(year), monthIndex: String(monthIndex), range: requestedRange });
      const res = await fetch(`/api/integrations/3cx/values?${params.toString()}`, { credentials: "include" });
      const payload = (await res.json()) as ThreeCxValuesResponse;
      if (!res.ok || !payload.ok || !payload.metrics) {
        setValuesError(payload.error ?? "Could not load saved call KPI values.");
        setCurrentMetrics(null);
        return;
      }
      setCurrentMetrics(payload.metrics);
      applyReportRows(payload.rows ?? []);
    } catch (error) {
      setValuesError(error instanceof Error ? error.message : "Could not load saved call KPI values.");
      setCurrentMetrics(null);
    } finally {
      setValuesLoading(false);
    }
  }, [activeRange, applyReportRows, monthIndex, user?.role, year]);

  useEffect(() => {
    if (loading || !canAccessDev(user?.role)) return;
    const timer = window.setTimeout(() => {
      void loadLogs();
      void loadImports();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadImports, loadLogs, loading, user?.role]);

  useEffect(() => {
    if (loading || !canAccessDev(user?.role)) return;
    const timer = window.setTimeout(() => {
      void loadCurrentValues();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCurrentValues, loading, user?.role]);

  const handleImportResult = useCallback(
    (payload: ThreeCxImportResponse, fallbackSource: string, importedRange: ThreeCxRange) => {
      const metrics = payload.metrics;
      const source = payload.source?.attachmentName || payload.source?.subject || fallbackSource;
      const resultYear = typeof payload.year === "number" ? payload.year : year;
      const resultMonthIndex = typeof payload.monthIndex === "number" ? payload.monthIndex : monthIndex;
      const resultMonth = payload.month ?? MONTHS[resultMonthIndex] ?? MONTHS[monthIndex];
      const resultRange = payload.range ?? importedRange;
      const resultRangeLabel = payload.rangeLabel ?? rangeLabel(resultRange);
      const rows = payload.rows ?? [];
      showSnackbar(
        metrics
          ? `Imported ${resultMonth} ${resultYear} ${resultRangeLabel} from ${source}: ${metrics.received} received, ${metrics.answered} answered, ${metrics.missed} missed.`
          : `Imported ${resultMonth} ${resultYear} ${resultRangeLabel} from ${source}.`,
        "success",
      );
      applyReportRows(rows);
      setCurrentMetrics(payload.metrics ?? null);
      const { startDate, endDate } = reportRangeDates(resultYear, resultMonthIndex, resultRange);
      const importedRecord: ThreeCxImportRecord = {
        id: -Date.now(),
        source: "email",
        source_filename: source,
        source_message_id: null,
        report_type: "queue_performance",
        report_start_date: startDate,
        report_end_date: endDate,
        row_count: rows.filter((row) => row.level === "queue").length || payload.matchedRows || 1,
        extension_row_count: rows.filter((row) => row.level === "extension").length,
        imported_by_email: null,
        imported_at: new Date().toISOString(),
      };
      setImports((prev) =>
        resultYear === year && resultMonthIndex === monthIndex
          ? [
              importedRecord,
              ...prev.filter(
                (item) => item.report_start_date !== startDate || item.report_end_date !== endDate || item.source !== "email",
              ),
            ]
          : [importedRecord],
      );
      setYear(resultYear);
      setMonthIndex(resultMonthIndex);
      setRange(resultRange);
      void loadLogs();
      if (resultYear === year && resultMonthIndex === monthIndex) {
        void loadImports();
      }
    },
    [applyReportRows, loadImports, loadLogs, monthIndex, showSnackbar, year],
  );

  const fetchThreeCxEmail = useCallback(async () => {
    if (!canAccessDev(user?.role)) return;
    setBusy("email");
    try {
      const res = await fetch("/api/integrations/3cx/import-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ year, monthIndex }),
      });
      const payload = (await res.json()) as ThreeCxImportResponse;
      if (!res.ok || !payload.ok) {
        showSnackbar(payload.error ?? "Could not fetch the 3CX report email.", "error");
        void loadLogs();
        return;
      }
      handleImportResult(payload, "3CX email", "month");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not fetch the 3CX report email.";
      showSnackbar(message, "error");
    } finally {
      setBusy(null);
    }
  }, [handleImportResult, loadLogs, monthIndex, showSnackbar, user?.role, year]);

  const rawTableRows = reportRows.length > 0 ? reportRows : fallbackReportRows(currentMetrics);
  const tableRows = dataOnlyReportRows(rawTableRows);
  const displayedRows = visibleReportRows(tableRows, expandedQueues);

  const importManualCsv = useCallback(async () => {
    if (!canAccessDev(user?.role)) return;
    if (!manualFile) {
      showSnackbar("Choose a CSV file first.", "error");
      return;
    }
    setBusy("manual");
    try {
      const form = new FormData();
      form.append("year", String(year));
      form.append("monthIndex", String(monthIndex));
      form.append("range", selectedManualRange);
      form.append("file", manualFile);
      const res = await fetch("/api/integrations/3cx/import-manual", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const payload = (await res.json()) as ThreeCxImportResponse;
      if (!res.ok || !payload.ok) {
        showSnackbar(payload.error ?? "Could not import the CSV file.", "error");
        void loadLogs();
        return;
      }
      handleImportResult(payload, manualFile.name, selectedManualRange);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not import the CSV file.";
      showSnackbar(message, "error");
    } finally {
      setBusy(null);
    }
  }, [handleImportResult, loadLogs, manualFile, monthIndex, selectedManualRange, showSnackbar, user?.role, year]);

  const deleteImportRecord = useCallback(
    async (item: ThreeCxImportRecord) => {
      if (!canAccessDev(user?.role) || item.id <= 0) return;
      const file = formatImportFile(item);
      const importRange = formatImportRange(item);
      const confirmed = window.confirm(`Delete this saved 3CX import?\n\n${file}\n${importRange}`);
      if (!confirmed) return;

      setDeletingImportId(item.id);
      try {
        const res = await fetch("/api/integrations/3cx/imports", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: item.id }),
        });
        const payload = (await res.json()) as DeleteThreeCxImportResponse;
        if (!res.ok || !payload.ok) {
          showSnackbar(payload.error ?? "Could not delete the 3CX import.", "error");
          return;
        }

        setImports((prev) => prev.filter((row) => row.id !== item.id));
        const deletedRows = (payload.deleted?.queueRows ?? 0) + (payload.deleted?.extensionRows ?? 0);
        showSnackbar(`Deleted ${payload.deleted?.fileLabel ?? file} and ${deletedRows.toLocaleString()} saved row(s).`, "success");
        void loadCurrentValues();
        void loadImports();
        void loadLogs();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not delete the 3CX import.";
        showSnackbar(message, "error");
      } finally {
        setDeletingImportId(null);
      }
    },
    [loadCurrentValues, loadImports, loadLogs, showSnackbar, user?.role],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading import tool...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Snackbar
        message={snackbar?.text ?? null}
        variant={snackbar?.variant ?? "success"}
        onDismiss={() => setSnackbar(null)}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-36 flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span>Year</span>
          <select
            className="min-h-[34px] rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-semibold text-foreground"
            value={String(year)}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setRange("month");
              setManualRange("month");
              setManualRangeDraft("month");
            }}
            disabled={disabled}
          >
            {SUPPORTED_KPI_YEARS.map((optionYear) => (
              <option key={optionYear} value={optionYear}>
                {optionYear}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex w-full overflow-x-auto border-b border-border">
        {MONTHS.map((month, index) => (
          <button
            key={month}
            type="button"
            onClick={() => {
              setMonthIndex(index);
              setRange("month");
              setManualRange("month");
              setManualRangeDraft("month");
            }}
            disabled={disabled}
            className={
              "min-h-[38px] min-w-12 flex-1 px-3 text-xs font-semibold transition disabled:opacity-50 " +
              (monthIndex === index
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")
            }
          >
            {month}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {visibleWeekFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setRange(filter.value)}
            disabled={disabled}
            className={
              "min-h-[30px] rounded-md px-2.5 text-xs font-semibold transition disabled:opacity-50 " +
              (activeRange === filter.value
                ? "bg-accent-muted text-foreground ring-1 ring-border"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")
            }
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background/60 shadow-sm">
        <div className="border-b border-border bg-muted/40 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Queue Performance Overview</h3>
            </div>
            <button
              type="button"
              className="inline-flex min-h-[34px] items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent-muted/40 disabled:opacity-50"
              onClick={() => {
                void loadCurrentValues();
                void loadLogs();
                void loadImports();
              }}
              disabled={valuesLoading || busy === "logs"}
            >
              {valuesLoading || busy === "logs" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              )}
              Refresh
            </button>
          </div>
        </div>
        {valuesError ? (
          <p className="px-4 py-4 text-xs text-red-700 dark:text-red-300">{valuesError}</p>
        ) : tableRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No queue rows with activity for this range.
          </p>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
                  <th className="w-[36%] px-4 py-2">Queue</th>
                  <th className="px-4 py-2 text-right">Received</th>
                  <th className="px-4 py-2 text-right">Serviced</th>
                  <th className="px-4 py-2 text-right">Unanswered</th>
                  <th className="px-4 py-2 text-right">Talk Time</th>
                  <th className="px-4 py-2 text-right">Average Talk Time</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row, index) => {
                  const child = row.level === "extension";
                  const total = row.level === "total";
                  const hasChildren = queueHasChildren(tableRows, tableRows.indexOf(row));
                  const expanded = expandedQueues.has(queueKey(row));
                  return (
                    <tr
                      key={`${row.label}-${index}`}
                      className={
                        "border-b border-border transition-colors hover:bg-accent-muted/30 " +
                        (total ? "bg-muted/40 font-semibold" : child ? "bg-background/70" : "bg-card")
                      }
                    >
                      <td className="px-4 py-2">
                        <div className={"flex items-center gap-2 " + (child ? "pl-6" : "")}>
                          {child || total ? (
                            <span className="h-4 w-4 shrink-0" />
                          ) : hasChildren ? (
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
                              aria-label={expanded ? `Collapse ${row.label}` : `Expand ${row.label}`}
                              onClick={() => {
                                const key = queueKey(row);
                                setExpandedQueues((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" aria-hidden />
                              ) : (
                                <ChevronRight className="h-4 w-4" aria-hidden />
                              )}
                            </button>
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          )}
                          <span className={child ? "text-foreground/90" : "text-foreground"}>{row.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-foreground">{formatCount(row.received)}</td>
                      <td className="px-4 py-2 text-right text-foreground">{formatCount(row.serviced)}</td>
                      <td className="px-4 py-2 text-right text-foreground">{row.unansweredLabel}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {child ? row.talkTime : ""}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {child ? row.averageTalkTime : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Fetches the scheduled 3CX email for the selected month and places it in the week based on when the email was received.
        </p>
        <button
          type="button"
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
          onClick={() => void fetchThreeCxEmail()}
          disabled={disabled || !canAccessDev(user?.role)}
        >
          {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MailSearch className="h-4 w-4" aria-hidden />}
          {busy === "email" ? "Fetching..." : "Fetch email"}
        </button>
      </div>

      <div className="border-t border-border pt-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-44">
            <span>Upload range</span>
            <select
              className="min-h-[40px] rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground"
              value={selectedManualRangeDraft}
              onChange={(e) => setManualRangeDraft(e.target.value as ThreeCxRange)}
              disabled={disabled}
            >
              {manualRangeFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-accent-muted/40 disabled:opacity-50"
            onClick={() => {
              setManualRange(selectedManualRangeDraft);
              showSnackbar(`Manual upload range set to ${rangeLabel(selectedManualRangeDraft)}.`, "success");
            }}
            disabled={disabled || selectedManualRangeDraft === selectedManualRange}
          >
            Apply range
          </button>
          <p className="pb-2 text-xs text-muted-foreground sm:flex-1">
            Import will use {rangeLabel(selectedManualRange)} for {MONTHS[monthIndex]} {year}.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            <span>Manual CSV</span>
            <input
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              className="min-h-[40px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-foreground"
              disabled={disabled}
              onChange={(e) => setManualFile(e.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-accent-muted/40 disabled:opacity-50"
            onClick={() => void importManualCsv()}
            disabled={disabled || !manualFile || !canAccessDev(user?.role)}
          >
            {busy === "manual" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />}
            {busy === "manual" ? "Importing..." : "Import CSV"}
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Saved imports</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Records from threecx_queue_report_imports.</p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-[34px] items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent-muted/40 disabled:opacity-50"
            onClick={() => void loadImports()}
            disabled={importsLoading}
          >
            {importsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            Refresh
          </button>
        </div>
        {importsError ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            {importsError}
          </p>
        ) : imports.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
            No saved 3CX imports yet.
          </p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-lg border border-border bg-background/60">
            <table className="w-full min-w-[860px] border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-muted/70 text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-semibold">File</th>
                  <th className="px-3 py-2 font-semibold">Range</th>
                  <th className="px-3 py-2 text-right font-semibold">Queues</th>
                  <th className="px-3 py-2 text-right font-semibold">Extensions</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">Imported</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((item) => {
                  const isDeleting = deletingImportId === item.id;
                  return (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-accent-muted/25">
                      <td className="max-w-64 truncate px-3 py-2 font-medium text-foreground" title={formatImportFile(item)}>
                        {formatImportFile(item)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatImportRange(item)}</td>
                      <td className="px-3 py-2 text-right text-foreground">{item.row_count.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-foreground">{item.extension_row_count.toLocaleString()}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatImportSource(item)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatLogTime(item.imported_at)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button
                          type="button"
                          className="inline-flex min-h-[30px] items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                          onClick={() => void deleteImportRecord(item)}
                          disabled={disabled || item.id <= 0}
                          title="Delete saved import"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Import logs</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Recent 3CX email and manual CSV imports.</p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-[34px] items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent-muted/40 disabled:opacity-50"
            onClick={() => void loadLogs()}
            disabled={disabled}
          >
            {busy === "logs" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            Refresh
          </button>
        </div>
        {logsError ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            {logsError}
          </p>
        ) : logs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
            No 3CX import logs yet.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border bg-background/60">
            {logs.map((log) => {
              const metrics = metricLabel(log.context);
              const source = sourceLabel(log.context);
              return (
                <div key={log.id} className="px-3 py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-foreground">{log.message}</p>
                    <span className="font-mono text-[11px] text-muted-foreground">{formatLogTime(log.created_at)}</span>
                  </div>
                  {metrics ? <p className="mt-1 text-xs text-muted-foreground">{metrics}</p> : null}
                  {source ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">{source}</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
