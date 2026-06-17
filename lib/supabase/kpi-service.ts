import type { KpiDefinition, KpiUnit, WeeklyRow } from "@/lib/kpi/types";
import { formatWeekLabel } from "@/lib/kpi/week-label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export { upsertWeeklyRows } from "@/lib/supabase/kpi-service-write";

type KpiDefinitionRow = {
  id: string | number;
  slug: string;
  label: string;
  unit: KpiUnit;
  suffix: string | null;
  target: number;
  sort_order: number;
};

type KpiWeeklyRow = {
  kpi_slug: string;
  year: number;
  week_index: number;
  this_year: number | null;
  last_year: number | null;
};

export async function fetchKpiDefinitions(): Promise<{
  data: KpiDefinition[];
  error?: string;
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: [], error: "Data connection is not available." };

  const { data, error } = await supabase
    .from("kpi_definitions")
    .select("id, slug, label, unit, suffix, target, sort_order")
    .order("sort_order", { ascending: true });

  if (error) return { data: [], error: error.message };

  const mapped: KpiDefinition[] = (data as KpiDefinitionRow[]).map((row) => ({
    id: String(row.id),
    slug: row.slug,
    label: row.label,
    unit: row.unit,
    suffix: row.suffix ?? "",
    target: row.target,
    sortOrder: row.sort_order,
  }));

  return { data: mapped };
}

export async function fetchWeeklyRows(
  kpiSlug: string,
  year: number,
): Promise<{ data: WeeklyRow[]; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: [], error: "Data connection is not available." };

  const { data, error } = await supabase
    .from("kpi_weekly_values")
    .select("kpi_slug, year, week_index, this_year, last_year")
    .eq("kpi_slug", kpiSlug)
    .eq("year", year)
    .order("week_index", { ascending: true });

  if (error) return { data: [], error: error.message };

  const mapped: WeeklyRow[] = (data as KpiWeeklyRow[]).map((row) => ({
    weekLabel: formatWeekLabel(row.week_index),
    weekIndex: row.week_index,
    thisYear: row.this_year,
    lastYear: row.last_year,
  }));

  return { data: mapped };
}

