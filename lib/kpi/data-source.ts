import { fetchKpiDefinitions, fetchWeeklyRows } from "@/lib/supabase/kpi-service";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { KpiDefinition, WeeklyRow } from "./types";

export function formatKpiValue(value: number | null, unit: KpiDefinition["unit"]): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (unit === "count") return Math.round(value).toLocaleString();
  if (unit === "percent" || unit === "score") return value % 1 === 0 ? String(value) : value.toFixed(1);
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

export const MOCK_DOCTORS = [
  "Dr. Ansuh-Amponsah, Natalie",
  "Dr. Brown, Kyjuan",
  "Dr. Chandrruangphen, Pornpat",
  "Dr. Estwick, Paula",
  "Dr. Gonzalez, Fermin",
  "Dr. Flood, Amani",
  "Dr. Dzepina, Davor",
] as const;

/** Shown to everyone — avoid product/vendor jargon */
export const MSG_DATA_NOT_CONFIGURED =
  "The data connection isn’t set up yet. If this site is hosted online, add the Supabase URL and anon key in your hosting project’s environment variables (for Vercel: Project → Settings → Environment Variables), then redeploy. Otherwise ask whoever manages this app or your IT contact to finish local configuration.";

export const MSG_KPIS_NOT_INITIALIZED =
  "No KPIs are available yet. Your technical contact needs to run the one-time database setup (schema and seed scripts from the project).";

export const MSG_DATA_UNAVAILABLE = "We couldn’t reach the data service. Try again shortly, or ask your administrator to check the connection.";

export async function loadKpiDefinitions(): Promise<{
  data: KpiDefinition[];
  fromSupabase: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { data: [], fromSupabase: false, error: MSG_DATA_NOT_CONFIGURED };
  }

  const result = await fetchKpiDefinitions();
  if (result.error) {
    return { data: [], fromSupabase: true, error: MSG_DATA_UNAVAILABLE };
  }
  if (result.data.length === 0) {
    return { data: [], fromSupabase: true, error: MSG_KPIS_NOT_INITIALIZED };
  }

  return { data: result.data, fromSupabase: true };
}

export async function loadWeeklyRows(
  slug: string,
  year: number,
): Promise<{ data: WeeklyRow[]; fromSupabase: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { data: [], fromSupabase: false, error: MSG_DATA_NOT_CONFIGURED };
  }

  const result = await fetchWeeklyRows(slug, year);
  if (result.error) {
    return { data: [], fromSupabase: true, error: MSG_DATA_UNAVAILABLE };
  }

  return { data: result.data, fromSupabase: true };
}
