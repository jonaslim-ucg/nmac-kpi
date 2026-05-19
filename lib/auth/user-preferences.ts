import { createServiceRoleClient } from "@/lib/supabase/admin";

export type UserDashboardPreferences = {
  hideLegacyNav: boolean;
  useNmacTestData: boolean;
  nmacMonthCacheRevision: number;
};

type PrefsRow = {
  hide_legacy_nav: boolean;
  use_nmac_test_data: boolean;
  nmac_month_cache_revision: number | string;
};

function rowToPrefs(row: PrefsRow): UserDashboardPreferences {
  return {
    hideLegacyNav: Boolean(row.hide_legacy_nav),
    useNmacTestData: row.use_nmac_test_data !== false,
    nmacMonthCacheRevision: Number(row.nmac_month_cache_revision) || 0,
  };
}

export async function getUserDashboardPreferences(userId: string): Promise<UserDashboardPreferences | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("hide_legacy_nav,use_nmac_test_data,nmac_month_cache_revision")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToPrefs(data as PrefsRow);
}

export type UpdateUserDashboardPreferencesInput = {
  hideLegacyNav?: boolean;
  useNmacTestData?: boolean;
  bumpNmacMonthCacheRevision?: boolean;
};

export async function updateUserDashboardPreferences(
  userId: string,
  input: UpdateUserDashboardPreferencesInput,
): Promise<UserDashboardPreferences | null> {
  const supabase = createServiceRoleClient();
  const current = await getUserDashboardPreferences(userId);
  if (!current) return null;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.hideLegacyNav !== undefined) patch.hide_legacy_nav = input.hideLegacyNav;
  if (input.useNmacTestData !== undefined) patch.use_nmac_test_data = input.useNmacTestData;
  if (input.bumpNmacMonthCacheRevision) {
    patch.nmac_month_cache_revision = current.nmacMonthCacheRevision + 1;
  }

  const { data, error } = await supabase
    .from("app_users")
    .update(patch)
    .eq("id", userId)
    .select("hide_legacy_nav,use_nmac_test_data,nmac_month_cache_revision")
    .single();

  if (error || !data) return null;
  return rowToPrefs(data as PrefsRow);
}
