import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function normalizeTargets(raw: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export async function fetchNmacTargets(year: number): Promise<{ data: Record<string, number>; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: {}, error: "Data connection is not available." };

  const { data, error } = await supabase.from("nmac_master_targets").select("values").eq("year", year).maybeSingle();

  if (error) return { data: {}, error: error.message };
  const raw = data?.values as Record<string, unknown> | undefined;
  return { data: normalizeTargets(raw) };
}

/** Per-calendar-month target patches (merged on top of FY row). */
export async function fetchNmacTargetMonths(
  year: number,
): Promise<{ data: Partial<Record<number, Record<string, number>>>; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: {}, error: "Data connection is not available." };

  const { data, error } = await supabase.from("nmac_master_target_months").select("month_index, values").eq("year", year);

  if (error) return { data: {}, error: error.message };
  const out: Partial<Record<number, Record<string, number>>> = {};
  for (const row of data ?? []) {
    const m = row.month_index as number;
    if (typeof m !== "number" || m < 0 || m > 11) continue;
    out[m] = normalizeTargets(row.values as Record<string, unknown> | undefined);
  }
  return { data: out };
}

export async function upsertNmacTargets(
  year: number,
  values: Record<string, number>,
): Promise<{ error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Data connection is not available." };

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

export async function upsertNmacTargetMonth(
  year: number,
  monthIndex: number,
  values: Record<string, number>,
): Promise<{ error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Data connection is not available." };

  const { error } = await supabase.from("nmac_master_target_months").upsert(
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

export async function deleteNmacTargetMonth(year: number, monthIndex: number): Promise<{ error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Data connection is not available." };

  const { error } = await supabase.from("nmac_master_target_months").delete().eq("year", year).eq("month_index", monthIndex);

  if (error) return { error: error.message };
  return {};
}
