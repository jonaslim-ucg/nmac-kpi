import { normalizeCustomRoles, type CustomRole } from "@/lib/auth/custom-roles";
import { normalizeRoleNmacNavAccess, type RoleNmacNavAccess } from "@/lib/auth/role-nmac-nav";
import { normalizeHiddenNmacKpiIds } from "@/lib/kpi-nmac-2026/model";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const APP_SETTINGS_ID = "default";

export type AppDashboardSettings = {
  hideLegacyNav: boolean;
  useNmacTestData: boolean;
  nmacMonthCacheRevision: number;
  roleNmacNav: RoleNmacNavAccess;
  customRoles: CustomRole[];
  maintenanceMode: boolean;
  hiddenNmacKpiIds: string[];
};

type SettingsRow = {
  hide_legacy_nav: boolean;
  use_nmac_test_data: boolean;
  nmac_month_cache_revision: number | string;
  role_nmac_nav?: unknown;
  custom_roles?: unknown;
  maintenance_mode?: boolean;
  hidden_nmac_kpi_ids?: unknown;
};

function rowToSettings(row: SettingsRow): AppDashboardSettings {
  const customRoles = normalizeCustomRoles(row.custom_roles);
  return {
    hideLegacyNav: Boolean(row.hide_legacy_nav),
    useNmacTestData: row.use_nmac_test_data !== false,
    nmacMonthCacheRevision: Number(row.nmac_month_cache_revision) || 0,
    roleNmacNav: normalizeRoleNmacNavAccess(row.role_nmac_nav, customRoles),
    customRoles,
    maintenanceMode: row.maintenance_mode === true,
    hiddenNmacKpiIds: normalizeHiddenNmacKpiIds(row.hidden_nmac_kpi_ids),
  };
}

export async function getAppDashboardSettings(): Promise<AppDashboardSettings | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("hide_legacy_nav,use_nmac_test_data,nmac_month_cache_revision,role_nmac_nav,custom_roles,maintenance_mode,hidden_nmac_kpi_ids")
    .eq("id", APP_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    const fallback = await supabase
      .from("app_settings")
      .select("hide_legacy_nav,use_nmac_test_data,nmac_month_cache_revision,role_nmac_nav,custom_roles,maintenance_mode")
      .eq("id", APP_SETTINGS_ID)
      .maybeSingle();
    if (fallback.error || !fallback.data) return null;
    return rowToSettings(fallback.data as SettingsRow);
  }
  if (!data) return null;
  return rowToSettings(data as SettingsRow);
}

export type UpdateAppDashboardSettingsInput = {
  hideLegacyNav?: boolean;
  useNmacTestData?: boolean;
  bumpNmacMonthCacheRevision?: boolean;
  roleNmacNav?: RoleNmacNavAccess;
  customRoles?: CustomRole[];
  maintenanceMode?: boolean;
  hiddenNmacKpiIds?: string[];
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
  if (input.customRoles !== undefined) {
    patch.custom_roles = input.customRoles;
  }
  if (input.maintenanceMode !== undefined) {
    patch.maintenance_mode = input.maintenanceMode;
  }
  if (input.hiddenNmacKpiIds !== undefined) {
    patch.hidden_nmac_kpi_ids = normalizeHiddenNmacKpiIds(input.hiddenNmacKpiIds);
  }

  const { data, error } = await supabase
    .from("app_settings")
    .update(patch)
    .eq("id", APP_SETTINGS_ID)
    .select("hide_legacy_nav,use_nmac_test_data,nmac_month_cache_revision,role_nmac_nav,custom_roles,maintenance_mode,hidden_nmac_kpi_ids")
    .single();

  if (error) {
    if (input.hiddenNmacKpiIds !== undefined) return null;
    const fallback = await supabase
      .from("app_settings")
      .update(patch)
      .eq("id", APP_SETTINGS_ID)
      .select("hide_legacy_nav,use_nmac_test_data,nmac_month_cache_revision,role_nmac_nav,custom_roles,maintenance_mode")
      .single();
    if (fallback.error || !fallback.data) return null;
    return rowToSettings(fallback.data as SettingsRow);
  }
  if (!data) return null;
  return rowToSettings(data as SettingsRow);
}
