import type { WeeklyRow } from "@/lib/kpi/types";

async function postJson<T extends Record<string, unknown>>(
  path: string,
  body: T,
): Promise<{ error?: string }> {
  try {
    const r = await fetch(path, {
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

export async function upsertWeeklyRows(
  kpiSlug: string,
  year: number,
  rows: WeeklyRow[],
): Promise<{ error?: string }> {
  return postJson("/api/kpi/weekly", { kpiSlug, year, rows });
}
