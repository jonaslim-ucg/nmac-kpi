import { emptyNmacMonthDbs, normalizeKpiPoint, type MonthDb } from "@/lib/kpi-nmac-2026/model";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function postNmacMaster(body: Record<string, unknown>): Promise<{ error?: string }> {
  try {
    const r = await fetch("/api/kpi/nmac-master", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) return { error: j.error ?? "Could not save." };
    return {};
  } catch {
    return { error: "Could not save." };
  }
}

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
  return postNmacMaster({ action: "month", year, monthIndex, values });
}
