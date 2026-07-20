import { NextResponse } from "next/server";
import { normalizeThreeCxImportRange } from "@/lib/3cx/email-report";
import { callMetricsFromMonth, readDetailedReport } from "@/lib/3cx/import-server";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";
import { isNmacNavViewAllowed } from "@/lib/auth/role-nmac-nav";
import { getSessionFromCookies } from "@/lib/auth/session";
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

function parseDay(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

const EMPTY_METRICS = {
  received: 0,
  answered: 0,
  missed: 0,
  answeredRate: 0,
};

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) return unauthorized();
  const settings = await getAppDashboardSettings();
  if (!isNmacNavViewAllowed(session.role, "threecx", settings?.roleNmacNav ?? {})) return unauthorized();

  const url = new URL(req.url);
  const year = parseYear(url.searchParams.get("year"));
  const monthIndex = parseMonthIndex(url.searchParams.get("monthIndex"));
  const range = normalizeThreeCxImportRange(url.searchParams.get("range"));
  const day = range === "day" ? parseDay(url.searchParams.get("day")) : undefined;
  if (year === null || monthIndex === null) {
    return NextResponse.json({ error: "Choose a valid month and year." }, { status: 400 });
  }
  if (range === "day" && day === null) {
    return NextResponse.json({ error: "Choose a valid report day." }, { status: 400 });
  }
  if (range === "day" && typeof day === "number" && day > new Date(year, monthIndex + 1, 0).getDate()) {
    return NextResponse.json({ error: "Choose a valid report day for the selected month." }, { status: 400 });
  }

  const detailed = await readDetailedReport({ year, monthIndex, range, day: day ?? undefined });
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
  if (range === "day") {
    return NextResponse.json({
      ok: true,
      year,
      monthIndex,
      month: MONTHS[monthIndex],
      range,
      day,
      metrics: EMPTY_METRICS,
      rows: [],
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
