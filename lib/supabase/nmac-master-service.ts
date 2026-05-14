import { emptyNmacMonthDbs, normalizeKpiPoint, type MonthDb } from "@/lib/kpi-nmac-2026/model";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type MonthlyRow = { month_index: number; values: Record<string, unknown> | null };

function normalizeMonthValues(raw: Record<string, unknown> | null | undefined): MonthDb {
  const out: MonthDb = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    out[k] = normalizeKpiPoint(v);
  }
  return out;
}

export async function fetchNmacMasterMonthly(
  year: number,
): Promise<{ data: Record<number, MonthDb>; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: emptyNmacMonthDbs(), error: "Data connection is not available." };

  const { data, error } = await supabase
    .from("nmac_master_monthly")
    .select("month_index, values")
    .eq("year", year)
    .order("month_index", { ascending: true });

  if (error) return { data: emptyNmacMonthDbs(), error: error.message };

  const out = emptyNmacMonthDbs();
  for (const row of (data as MonthlyRow[]) ?? []) {
    const mi = row.month_index;
    if (typeof mi === "number" && mi >= 0 && mi <= 11) {
      out[mi] = normalizeMonthValues(row.values ?? undefined);
    }
  }
  return { data: out };
}

export async function upsertNmacMasterMonth(
  year: number,
  monthIndex: number,
  values: MonthDb,
): Promise<{ error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Data connection is not available." };

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
