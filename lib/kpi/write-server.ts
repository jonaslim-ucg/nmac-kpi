import type { WeeklyRow } from "@/lib/kpi/types";
import type { MonthDb } from "@/lib/kpi-nmac-2026/model";
import { normalizeKpiPoint } from "@/lib/kpi-nmac-2026/model";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const TARGET_MONTHS_TABLE = "nmac_master_target_months";

export async function writeWeeklyRows(
  kpiSlug: string,
  year: number,
  rows: WeeklyRow[],
): Promise<{ error?: string }> {
  const supabase = createServiceRoleClient();
  const payload = rows.map((row) => ({
    kpi_slug: kpiSlug,
    year,
    week_index: row.weekIndex,
    this_year: row.thisYear,
    last_year: row.lastYear,
  }));

  const { error } = await supabase
    .from("kpi_weekly_values")
    .upsert(payload, { onConflict: "kpi_slug,year,week_index" });

  if (error) return { error: error.message };
  return {};
}

export async function writeNmacMasterMonth(
  year: number,
  monthIndex: number,
  values: MonthDb,
): Promise<{ error?: string }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("nmac_master_monthly").upsert(
    {
      year,
      month_index: monthIndex,
      values,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "year,month_index" },
  );

  if (error) return { error: error.message };
  return {};
}

export async function writeNmacTargets(
  year: number,
  values: Record<string, number>,
): Promise<{ error?: string }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("nmac_master_targets").upsert(
    {
      year,
      values,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "year" },
  );

  if (error) return { error: error.message };
  return {};
}

export async function writeNmacTargetMonth(
  year: number,
  monthIndex: number,
  values: Record<string, number>,
): Promise<{ error?: string }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from(TARGET_MONTHS_TABLE).upsert(
    {
      year,
      month_index: monthIndex,
      values,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "year,month_index" },
  );

  if (error) return { error: error.message };
  return {};
}

export async function deleteNmacTargetMonthRow(
  year: number,
  monthIndex: number,
): Promise<{ error?: string }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from(TARGET_MONTHS_TABLE)
    .delete()
    .eq("year", year)
    .eq("month_index", monthIndex);

  if (error) return { error: error.message };
  return {};
}

export function countMonthDbKpis(values: MonthDb): number {
  return Object.keys(values).length;
}

export function countTargetValues(values: Record<string, number>): number {
  return Object.keys(values).length;
}

type WeeklyDbRow = {
  week_index: number;
  this_year: number | null;
  last_year: number | null;
};

export async function readWeeklyRows(
  kpiSlug: string,
  year: number,
  weekIndices?: number[],
): Promise<{ data: WeeklyRow[]; error?: string }> {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("kpi_weekly_values")
    .select("week_index,this_year,last_year")
    .eq("kpi_slug", kpiSlug)
    .eq("year", year);

  if (weekIndices?.length) {
    query = query.in("week_index", weekIndices);
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };

  return {
    data: ((data ?? []) as WeeklyDbRow[]).map((row) => ({
      weekLabel: `Week ${row.week_index}`,
      weekIndex: row.week_index,
      thisYear: row.this_year,
      lastYear: row.last_year,
    })),
  };
}

function normalizeMonthDb(raw: Record<string, unknown> | null | undefined): MonthDb {
  const out: MonthDb = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    out[key] = normalizeKpiPoint(value);
  }
  return out;
}

export async function readNmacMasterMonth(
  year: number,
  monthIndex: number,
): Promise<{ data: MonthDb; error?: string }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("nmac_master_monthly")
    .select("values")
    .eq("year", year)
    .eq("month_index", monthIndex)
    .maybeSingle();

  if (error) return { data: {}, error: error.message };
  return { data: normalizeMonthDb((data?.values as Record<string, unknown> | null) ?? undefined) };
}

export async function readNmacTargets(year: number): Promise<{ data: Record<string, number>; error?: string }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("nmac_master_targets").select("values").eq("year", year).maybeSingle();
  if (error) return { data: {}, error: error.message };
  return { data: parseNumberRecord(data?.values) };
}

export async function readNmacTargetMonth(
  year: number,
  monthIndex: number,
): Promise<{ data: Record<string, number>; error?: string }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from(TARGET_MONTHS_TABLE)
    .select("values")
    .eq("year", year)
    .eq("month_index", monthIndex)
    .maybeSingle();

  if (error) return { data: {}, error: error.message };
  return { data: parseNumberRecord(data?.values) };
}

function parseNumberRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}
