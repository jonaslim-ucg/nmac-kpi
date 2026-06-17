import { getAppDashboardSettings } from "@/lib/auth/app-settings";
import { canBypassMaintenance } from "@/lib/auth/types";
import type { AppRole } from "@/lib/auth/types";

export const MAINTENANCE_BLOCK_MESSAGE =
  "NMAC KPI is temporarily unavailable for maintenance. Only administrators and developers can access the app right now.";

export { canBypassMaintenance };

export async function isMaintenanceModeEnabled(): Promise<boolean> {
  const settings = await getAppDashboardSettings();
  return settings?.maintenanceMode === true;
}

export function isBlockedByMaintenance(
  role: AppRole | null | undefined,
  maintenanceMode: boolean,
): boolean {
  return maintenanceMode && !canBypassMaintenance(role);
}

export async function getMaintenanceBlockForRole(
  role: AppRole | null | undefined,
): Promise<{ blocked: boolean; message: string }> {
  const maintenanceMode = await isMaintenanceModeEnabled();
  if (isBlockedByMaintenance(role, maintenanceMode)) {
    return { blocked: true, message: MAINTENANCE_BLOCK_MESSAGE };
  }
  return { blocked: false, message: "" };
}

let edgeCache: { at: number; value: boolean } | null = null;
const EDGE_CACHE_MS = 3000;

async function fetchMaintenanceFlagFromSupabase(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  try {
    const res = await fetch(`${url}/rest/v1/app_settings?select=maintenance_mode&id=eq.default`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const rows = (await res.json()) as { maintenance_mode?: boolean }[];
    return rows[0]?.maintenance_mode === true;
  } catch {
    return false;
  }
}

/** Edge-safe read with a short cache for middleware hot paths. */
export async function isMaintenanceModeEnabledEdge(): Promise<boolean> {
  const now = Date.now();
  if (edgeCache && now - edgeCache.at < EDGE_CACHE_MS) {
    return edgeCache.value;
  }
  const value = await fetchMaintenanceFlagFromSupabase();
  edgeCache = { at: now, value };
  return value;
}

export function clearMaintenanceModeEdgeCache() {
  edgeCache = null;
}
