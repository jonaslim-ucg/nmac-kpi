import { NextResponse } from "next/server";
import {
  auditWeeklyKpiSaved,
} from "@/lib/dev/audit-log";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canEditKpiData } from "@/lib/auth/types";
import {
  diffMonthDb,
  diffNumberRecord,
  diffWeeklyRows,
  packAuditChanges,
  removedNumberRecord,
} from "@/lib/dev/kpi-audit-diff";
import type { WeeklyRow } from "@/lib/kpi/types";
import {
  readNmacMasterMonth,
  readNmacTargetMonth,
  readNmacTargets,
  readWeeklyRows,
  writeWeeklyRows,
} from "@/lib/kpi/write-server";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  const settings = await getAppDashboardSettings();
  if (!session || !canEditKpiData(session.role, settings?.customRoles)) return unauthorized();

  const body = (await req.json()) as {
    kpiSlug?: unknown;
    year?: unknown;
    rows?: unknown;
  };

  const kpiSlug = typeof body.kpiSlug === "string" ? body.kpiSlug.trim() : "";
  const year = typeof body.year === "number" ? body.year : Number(body.year);
  const rows = body.rows;

  if (!kpiSlug || !Number.isFinite(year)) {
    return NextResponse.json({ error: "Invalid KPI or year." }, { status: 400 });
  }
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Invalid rows." }, { status: 400 });
  }

  const parsed: WeeklyRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const weekIndex = typeof r.weekIndex === "number" ? r.weekIndex : Number(r.weekIndex);
    if (!Number.isFinite(weekIndex)) continue;
    const thisYear =
      r.thisYear === null || r.thisYear === undefined
        ? null
        : typeof r.thisYear === "number"
          ? r.thisYear
          : Number(r.thisYear);
    const lastYear =
      r.lastYear === null || r.lastYear === undefined
        ? null
        : typeof r.lastYear === "number"
          ? r.lastYear
          : Number(r.lastYear);
    parsed.push({
      weekLabel: typeof r.weekLabel === "string" ? r.weekLabel : `Week ${weekIndex}`,
      weekIndex,
      thisYear: thisYear === null || Number.isNaN(thisYear) ? null : thisYear,
      lastYear: lastYear === null || Number.isNaN(lastYear) ? null : lastYear,
    });
  }

  const result = await writeWeeklyRows(kpiSlug, year, parsed);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const weekIndices = parsed.map((r) => r.weekIndex).sort((a, b) => a - b);
  const before = await readWeeklyRows(kpiSlug, year, weekIndices);
  const changes = packAuditChanges(diffWeeklyRows(before.data, parsed));

  auditWeeklyKpiSaved(
    { email: session.email, role: session.role },
    { kpiSlug, year, rowCount: parsed.length, weekIndices, changes },
  );

  return NextResponse.json({ ok: true });
}
