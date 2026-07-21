import { NextResponse } from "next/server";
import {
  reportDateRangeForMonth,
  threeCxRangeLabel,
  weeklyReportDateRangesForMonth,
  type ThreeCxCallMetrics,
  type ThreeCxReportRange,
  type ThreeCxReportRow,
} from "@/lib/3cx/email-report";
import { isAuthorizedThreeCxSecretRequest } from "@/lib/3cx/auth";
import { callMetricsFromMonth, readDetailedReport, readDetailedReportForDateRange } from "@/lib/3cx/import-server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";
import { readNmacMasterMonth } from "@/lib/kpi/write-server";

export const dynamic = "force-dynamic";

type ThreeCxDataMode = "month" | "week" | "range";
type ThreeCxDataRangeId = ThreeCxReportRange | "custom";
type ThreeCxDataSource = "saved_imports" | "saved_import" | "monthly_fallback" | "none";
type ThreeCxWeekRange = Exclude<ThreeCxReportRange, "month" | "last_week">;

type ThreeCxDataRange = {
  range: ThreeCxDataRangeId;
  rangeLabel: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  metrics: ThreeCxCallMetrics | null;
  rows: ThreeCxReportRow[];
  hasData: boolean;
  source: ThreeCxDataSource;
};

const AVAILABLE_START_DATE = "2026-07-01";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

function parseYear(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : null;
}

function parseMonthIndex(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 11 ? n : null;
}

function parseDateOnly(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function reportTimeZone() {
  return (process.env.GRAPH_3CX_REPORT_TIME_ZONE || "Atlantic/Bermuda").trim() || "Atlantic/Bermuda";
}

function dateOnlyInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateFromDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateForMessage(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(dateFromDateOnly(value));
}

function previousDateOnly(value: string) {
  const date = dateFromDateOnly(value);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function availableDateRange() {
  return {
    startDate: AVAILABLE_START_DATE,
    endDate: dateOnlyInTimeZone(new Date(), reportTimeZone()),
  };
}

function parseMode(url: URL): ThreeCxDataMode {
  const mode = (url.searchParams.get("mode") || url.searchParams.get("type") || "").toLowerCase();
  const range = (url.searchParams.get("range") || "").toLowerCase();
  if (mode === "range" || mode === "date_range") return "range";
  if (mode === "week") return "week";
  if (mode === "month") return "month";
  if (range === "range" || range === "custom" || range === "date_range") return "range";
  if (parseWeekRange(url.searchParams.get("range"))) return "week";
  if (url.searchParams.has("startDate") || url.searchParams.has("endDate")) return "range";
  if (url.searchParams.has("week")) return "week";
  return "month";
}

function parseWeekRange(value: string | null): ThreeCxWeekRange | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "week1" || raw === "week2" || raw === "week3" || raw === "week4" || raw === "week5") return raw;
  if (/^[1-5]$/.test(raw)) return `week${raw}` as ThreeCxWeekRange;
  const match = raw.match(/^week[_\s-]?([1-5])$/);
  return match ? (`week${match[1]}` as ThreeCxWeekRange) : null;
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

async function readWeekRange(
  year: number,
  monthIndex: number,
  range: ThreeCxWeekRange,
): Promise<ThreeCxDataRange | { error: string }> {
  const detailed = await readDetailedReport({ year, monthIndex, range });
  if (detailed.error) return { error: detailed.error };

  const hasData = detailed.metrics !== null && detailed.rows.length > 0;
  return {
    range,
    rangeLabel: threeCxRangeLabel(range),
    dateRange: reportDateRangeForMonth(year, monthIndex, range),
    metrics: detailed.metrics,
    rows: detailed.rows,
    hasData,
    source: hasData ? "saved_import" : "none",
  };
}

async function readCustomDateRange(startDate: string, endDate: string): Promise<ThreeCxDataRange | { error: string }> {
  const detailed = await readDetailedReportForDateRange({ startDate, endDate });
  if (detailed.error) return { error: detailed.error };

  const hasData = detailed.metrics !== null && detailed.rows.length > 0;
  return {
    range: "custom",
    rangeLabel: "Date range",
    dateRange: { startDate, endDate },
    metrics: detailed.metrics,
    rows: detailed.rows,
    hasData,
    source: hasData ? "saved_imports" : "none",
  };
}

async function readMonthRange(year: number, monthIndex: number): Promise<ThreeCxDataRange | { error: string }> {
  const detailed = await readDetailedReport({ year, monthIndex, range: "month" });
  if (detailed.error) return { error: detailed.error };

  if (detailed.metrics && detailed.rows.length > 0) {
    return {
      range: "month",
      rangeLabel: threeCxRangeLabel("month"),
      dateRange: reportDateRangeForMonth(year, monthIndex, "month"),
      metrics: detailed.metrics,
      rows: detailed.rows,
      hasData: true,
      source: "saved_imports",
    };
  }

  const fallback = await readNmacMasterMonth(year, monthIndex);
  if (fallback.error) return { error: fallback.error };

  return {
    range: "month",
    rangeLabel: threeCxRangeLabel("month"),
    dateRange: reportDateRangeForMonth(year, monthIndex, "month"),
    metrics: callMetricsFromMonth(fallback.data),
    rows: [],
    hasData: false,
    source: "monthly_fallback",
  };
}

async function canReadThreeCxData(req: Request) {
  if (isAuthorizedThreeCxSecretRequest(req)) return true;

  const session = await getSessionFromCookies();
  return Boolean(session && canAccessDev(session.role));
}

export async function GET(req: Request) {
  if (!(await canReadThreeCxData(req))) return unauthorized();

  const url = new URL(req.url);
  const mode = parseMode(url);
  const availableRange = availableDateRange();

  if (mode === "range") {
    const rawStartDate = url.searchParams.get("startDate");
    const rawEndDate = url.searchParams.get("endDate");
    const startDate = rawStartDate === null ? availableRange.startDate : parseDateOnly(rawStartDate);
    const endDate = rawEndDate === null ? availableRange.endDate : parseDateOnly(rawEndDate);
    if (!startDate || !endDate) {
      return noStoreJson({ error: "Choose valid startDate and endDate values in YYYY-MM-DD format." }, { status: 400 });
    }
    if (startDate > endDate) {
      return noStoreJson({ error: "startDate must be before or equal to endDate." }, { status: 400 });
    }
    if (startDate < availableRange.startDate) {
      const lastUnavailableDate = previousDateOnly(availableRange.startDate);
      return noStoreJson(
        {
          ok: false,
          error: `3CX daily data is available from ${formatDateForMessage(availableRange.startDate)} onward. ${formatDateForMessage(lastUnavailableDate)} or earlier is not available.`,
          availableDateRange: availableRange,
          requestedDateRange: { startDate, endDate },
        },
        { status: 400 },
      );
    }
    if (endDate > availableRange.endDate) {
      return noStoreJson(
        {
          ok: false,
          error: `3CX daily data is available up to ${formatDateForMessage(availableRange.endDate)}. Future dates after that are not available yet.`,
          availableDateRange: availableRange,
          requestedDateRange: { startDate, endDate },
        },
        { status: 400 },
      );
    }

    const data = await readCustomDateRange(startDate, endDate);
    if ("error" in data) return noStoreJson({ error: data.error }, { status: 500 });
    return noStoreJson({
      ok: true,
      mode,
      availableDateRange: availableRange,
      reportTimeZone: reportTimeZone(),
      data,
      metrics: data.metrics,
      rows: data.rows,
    });
  }

  const year = parseYear(url.searchParams.get("year"));
  const monthIndex = parseMonthIndex(url.searchParams.get("monthIndex"));
  if (year === null || monthIndex === null) {
    return noStoreJson({ error: "Choose a valid month and year." }, { status: 400 });
  }

  if (mode === "week") {
    const weekRange = parseWeekRange(url.searchParams.get("week")) ?? parseWeekRange(url.searchParams.get("range"));
    const validWeeks = weeklyReportDateRangesForMonth(year, monthIndex).map((item) => item.range);
    if (!weekRange || !validWeeks.includes(weekRange)) {
      return noStoreJson({ error: "Choose a valid week of the selected month." }, { status: 400 });
    }

    const data = await readWeekRange(year, monthIndex, weekRange);
    if ("error" in data) return noStoreJson({ error: data.error }, { status: 500 });
    return noStoreJson({
      ok: true,
      mode,
      availableDateRange: availableRange,
      year,
      monthIndex,
      month: MONTHS[monthIndex],
      week: weekRange,
      data,
      metrics: data.metrics,
      rows: data.rows,
    });
  }

  const [monthly, ...weekly] = await Promise.all([
    readMonthRange(year, monthIndex),
    ...weeklyReportDateRangesForMonth(year, monthIndex).map((item) => readWeekRange(year, monthIndex, item.range)),
  ]);

  const failed = [monthly, ...weekly].find((item): item is { error: string } => "error" in item);
  if (failed) return noStoreJson({ error: failed.error }, { status: 500 });

  const weeks = weekly as ThreeCxDataRange[];
  return noStoreJson({
    ok: true,
    mode,
    availableDateRange: availableRange,
    year,
    monthIndex,
    month: MONTHS[monthIndex],
    monthly,
    weeks,
    data: monthly,
    totals: {
      totalWeeks: weeks.length,
      weeksWithData: weeks.filter((week) => week.hasData).length,
    },
  });
}
