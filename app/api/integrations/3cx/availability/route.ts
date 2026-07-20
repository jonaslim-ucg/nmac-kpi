import { NextResponse } from "next/server";
import { reportDateRangeForMonth, weeklyReportDateRangesForMonth } from "@/lib/3cx/email-report";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";
import { isNmacNavViewAllowed } from "@/lib/auth/role-nmac-nav";
import { getSessionFromCookies } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ThreeCxVisibleRange = "month" | "day" | "week1" | "week2" | "week3" | "week4" | "week5";

type QueueRow = {
  report_start_date: string | null;
  report_end_date: string | null;
  total_calls: number | null;
  answered_calls: number | null;
  abandoned_calls: number | null;
  missed_calls: number | null;
};

const RANGE_ORDER: ThreeCxVisibleRange[] = ["month", "day", "week1", "week2", "week3", "week4", "week5"];

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

function parseYear(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : null;
}

function parseDateOnly(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function rowHasActivity(row: QueueRow) {
  return (
    (row.total_calls ?? 0) > 0 ||
    (row.answered_calls ?? 0) > 0 ||
    (row.abandoned_calls ?? 0) > 0 ||
    (row.missed_calls ?? 0) > 0
  );
}

function dateInRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

function sameRange(row: QueueRow, startDate: string, endDate: string) {
  return row.report_start_date === startDate && row.report_end_date === endDate;
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) return unauthorized();
  const settings = await getAppDashboardSettings();
  if (!isNmacNavViewAllowed(session.role, "threecx", settings?.roleNmacNav ?? {})) return unauthorized();

  const url = new URL(req.url);
  const year = parseYear(url.searchParams.get("year"));
  if (year === null) {
    return NextResponse.json({ error: "Choose a valid year." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const { data, error } = await supabase
    .from("threecx_queue_report_rows")
    .select("report_start_date,report_end_date,total_calls,answered_calls,abandoned_calls,missed_calls")
    .eq("report_type", "queue_performance")
    .gte("report_start_date", yearStart)
    .lte("report_end_date", yearEnd);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const activeRows = ((data ?? []) as QueueRow[]).filter((row) => {
    const startDate = parseDateOnly(row.report_start_date);
    const endDate = parseDateOnly(row.report_end_date);
    return startDate !== null && endDate !== null && rowHasActivity(row);
  });

  const months = Array.from({ length: 12 }, (_, monthIndex) => {
    const ranges = new Set<ThreeCxVisibleRange>();
    const dailyDates = new Set<string>();
    const monthRange = reportDateRangeForMonth(year, monthIndex, "month");
    const rowsInMonth = activeRows.filter((row) => {
      const startDate = row.report_start_date!;
      const endDate = row.report_end_date!;
      return dateInRange(startDate, monthRange.startDate, monthRange.endDate) && dateInRange(endDate, monthRange.startDate, monthRange.endDate);
    });

    if (rowsInMonth.length > 0) ranges.add("month");

    for (const row of rowsInMonth) {
      if (row.report_start_date === row.report_end_date) {
        ranges.add("day");
        dailyDates.add(row.report_start_date!);
      }
    }

    for (const week of weeklyReportDateRangesForMonth(year, monthIndex)) {
      const hasExactWeek = rowsInMonth.some((row) => sameRange(row, week.startDate, week.endDate));
      const hasDailyInWeek = [...dailyDates].some((date) => dateInRange(date, week.startDate, week.endDate));
      if (hasExactWeek || hasDailyInWeek) ranges.add(week.range as ThreeCxVisibleRange);
    }

    const orderedRanges = RANGE_ORDER.filter((range) => ranges.has(range));
    return {
      monthIndex,
      hasData: orderedRanges.length > 0,
      ranges: orderedRanges,
      dailyDates: [...dailyDates].sort(),
    };
  });

  return NextResponse.json(
    { ok: true, year, months },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
