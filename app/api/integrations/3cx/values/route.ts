import { NextResponse } from "next/server";
import { normalizeThreeCxRange } from "@/lib/3cx/email-report";
import { callMetricsFromMonth, readDetailedReport } from "@/lib/3cx/import-server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";
import { readNmacMasterMonth } from "@/lib/kpi/write-server";

export const dynamic = "force-dynamic";

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

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session || !canAccessDev(session.role)) return unauthorized();

  const url = new URL(req.url);
  const year = parseYear(url.searchParams.get("year"));
  const monthIndex = parseMonthIndex(url.searchParams.get("monthIndex"));
  const range = normalizeThreeCxRange(url.searchParams.get("range"));
  if (year === null || monthIndex === null) {
    return NextResponse.json({ error: "Choose a valid month and year." }, { status: 400 });
  }

  const detailed = await readDetailedReport({ year, monthIndex, range });
  if (detailed.error) return NextResponse.json({ error: detailed.error }, { status: 500 });
  if (detailed.metrics && detailed.rows.length > 0) {
    return NextResponse.json({
      ok: true,
      year,
      monthIndex,
      month: MONTHS[monthIndex],
      range,
      metrics: detailed.metrics,
      rows: detailed.rows,
    });
  }

  const result = await readNmacMasterMonth(year, monthIndex);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    year,
    monthIndex,
    month: MONTHS[monthIndex],
    range,
    metrics: callMetricsFromMonth(result.data),
    rows: [],
  });
}
