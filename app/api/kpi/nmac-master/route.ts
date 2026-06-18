import { NextResponse } from "next/server";
import {
  auditNmacMasterMonthSaved,
  auditNmacTargetMonthCleared,
  auditNmacTargetMonthSaved,
  auditNmacTargetsSaved,
} from "@/lib/dev/audit-log";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canEditKpiData } from "@/lib/auth/types";
import type { MonthDb } from "@/lib/kpi-nmac-2026/model";
import {
  countMonthDbKpis,
  countTargetValues,
  deleteNmacTargetMonthRow,
  writeNmacMasterMonth,
  writeNmacTargetMonth,
  writeNmacTargets,
} from "@/lib/kpi/write-server";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

function parseMonthIndex(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 11) return null;
  return n;
}

function parseYear(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseNumberRecord(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  const settings = await getAppDashboardSettings();
  if (!session || !canEditKpiData(session.role, settings?.customRoles)) return unauthorized();

  const body = (await req.json()) as {
    action?: unknown;
    year?: unknown;
    monthIndex?: unknown;
    values?: unknown;
  };

  const action = typeof body.action === "string" ? body.action : "";
  const year = parseYear(body.year);
  if (year === null) {
    return NextResponse.json({ error: "Invalid year." }, { status: 400 });
  }

  const actor = { email: session.email, role: session.role };

  if (action === "month") {
    const monthIndex = parseMonthIndex(body.monthIndex);
    if (monthIndex === null) {
      return NextResponse.json({ error: "Invalid month." }, { status: 400 });
    }
    const values = (body.values ?? {}) as MonthDb;
    const result = await writeNmacMasterMonth(year, monthIndex, values);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
    auditNmacMasterMonthSaved(actor, { year, monthIndex, kpiCount: countMonthDbKpis(values) });
    return NextResponse.json({ ok: true });
  }

  if (action === "targets") {
    const values = parseNumberRecord(body.values);
    if (!values) return NextResponse.json({ error: "Invalid targets." }, { status: 400 });
    const result = await writeNmacTargets(year, values);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
    auditNmacTargetsSaved(actor, { year, targetCount: countTargetValues(values) });
    return NextResponse.json({ ok: true });
  }

  if (action === "target_month") {
    const monthIndex = parseMonthIndex(body.monthIndex);
    if (monthIndex === null) {
      return NextResponse.json({ error: "Invalid month." }, { status: 400 });
    }
    const values = parseNumberRecord(body.values);
    if (!values) return NextResponse.json({ error: "Invalid targets." }, { status: 400 });
    const result = await writeNmacTargetMonth(year, monthIndex, values);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
    auditNmacTargetMonthSaved(actor, { year, monthIndex, targetCount: countTargetValues(values) });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_target_month") {
    const monthIndex = parseMonthIndex(body.monthIndex);
    if (monthIndex === null) {
      return NextResponse.json({ error: "Invalid month." }, { status: 400 });
    }
    const result = await deleteNmacTargetMonthRow(year, monthIndex);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
    auditNmacTargetMonthCleared(actor, { year, monthIndex });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
