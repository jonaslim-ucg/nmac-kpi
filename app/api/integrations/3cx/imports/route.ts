import { NextResponse } from "next/server";
import { reportDateRangeForMonth } from "@/lib/3cx/email-report";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

function parseLimit(value: string | null) {
  const n = Number(value);
  if (!Number.isInteger(n)) return 50;
  return Math.min(Math.max(n, 1), 100);
}

function parseYear(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : null;
}

function parseMonthIndex(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 11 ? n : null;
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session || !canAccessDev(session.role)) return unauthorized();

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const rawYear = url.searchParams.get("year");
  const rawMonthIndex = url.searchParams.get("monthIndex");
  const year = parseYear(rawYear);
  const monthIndex = parseMonthIndex(rawMonthIndex);
  if ((rawYear !== null || rawMonthIndex !== null) && (year === null || monthIndex === null)) {
    return NextResponse.json({ imports: [], error: "Choose a valid month and year." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  let query = supabase
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
        "imported_by_email",
        "imported_at",
      ].join(","),
    );

  if (year !== null && monthIndex !== null) {
    const { startDate, endDate } = reportDateRangeForMonth(year, monthIndex, "month");
    query = query.gte("report_start_date", startDate).lte("report_end_date", endDate);
  }

  const { data, error } = await query.order("imported_at", { ascending: false }).limit(limit);

  if (error) return NextResponse.json({ imports: [], error: error.message }, { status: 500 });

  return NextResponse.json(
    { ok: true, imports: data ?? [] },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
