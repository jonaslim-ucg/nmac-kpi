import { normalizeRoleNmacNavAccess, type RoleNmacNavAccess } from "@/lib/auth/role-nmac-nav";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const APP_SETTINGS_ID = "default";

export type AppDashboardSettings = {
  hideLegacyNav: boolean;
  useNmacTestData: boolean;
  nmacMonthCacheRevision: number;
  roleNmacNav: RoleNmacNavAccess;
};

type SettingsRow = {
  hide_legacy_nav: boolean;
  use_nmac_test_data: boolean;
  nmac_month_cache_revision: number | string;
  role_nmac_nav?: unknown;
};

function rowToSettings(row: SettingsRow): AppDashboardSettings {
  return {
    hideLegacyNav: Boolean(row.hide_legacy_nav),
    useNmacTestData: row.use_nmac_test_data !== false,
    nmacMonthCacheRevision: Number(row.nmac_month_cache_revision) || 0,
    roleNmacNav: normalizeRoleNmacNavAccess(row.role_nmac_nav),
  };
}

export async function getAppDashboardSettings(): Promise<AppDashboardSettings | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("hide_legacy_nav,use_nmac_test_data,nmac_month_cache_revision,role_nmac_nav")
    .eq("id", APP_SETTINGS_ID)
    .maybeSingle();

  if (error || !data) return null;
  return rowToSettings(data as SettingsRow);
}

export type UpdateAppDashboardSettingsInput = {
  hideLegacyNav?: boolean;
  useNmacTestData?: boolean;
  bumpNmacMonthCacheRevision?: boolean;
  roleNmacNav?: RoleNmacNavAccess;
};

export async function updateAppDashboardSettings(
  input: UpdateAppDashboardSettingsInput,
): Promise<AppDashboardSettings | null> {
  const supabase = createServiceRoleClient();
  const current = await getAppDashboardSettings();
  if (!current) return null;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.hideLegacyNav !== undefined) patch.hide_legacy_nav = input.hideLegacyNav;
  if (input.useNmacTestData !== undefined) patch.use_nmac_test_data = input.useNmacTestData;
  if (input.bumpNmacMonthCacheRevision) {
    patch.nmac_month_cache_revision = current.nmacMonthCacheRevision + 1;
  }
  if (input.roleNmacNav !== undefined) {
    patch.role_nmac_nav = input.roleNmacNav;
  }

  const { data, error } = await supabase
    .from("app_settings")
    .update(patch)
    .eq("id", APP_SETTINGS_ID)
    .select("hide_legacy_nav,use_nmac_test_data,nmac_month_cache_revision,role_nmac_nav")
    .single();

  if (error || !data) return null;
  return rowToSettings(data as SettingsRow);
}
