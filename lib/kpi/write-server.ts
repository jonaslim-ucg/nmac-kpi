import type { WeeklyRow } from "@/lib/kpi/types";
import type { MonthDb } from "@/lib/kpi-nmac-2026/model";
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
