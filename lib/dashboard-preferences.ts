import { STORAGE_KEY } from "@/lib/kpi-nmac-2026/model";

export const DASHBOARD_PREFS_EVENT = "kpi-dashboard-prefs";

export type DashboardPrefsDetail = {
  /** Re-run NMAC monthly + targets fetch (e.g. after clearing browser month cache). */
  reloadNmacFromServer?: boolean;
};

const HIDE_LEGACY_NAV_KEY = "kpi_hide_legacy_nav";
/** When true (default), empty NMAC charts may be filled with generated sample months. */
const USE_NMAC_TEST_DATA_KEY = "kpi_nmac_use_test_data";

function dispatchPrefs(detail?: DashboardPrefsDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DashboardPrefsDetail>(DASHBOARD_PREFS_EVENT, { detail: detail ?? {} }));
}

export function loadHideLegacyNav(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIDE_LEGACY_NAV_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveHideLegacyNav(hide: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (hide) window.localStorage.setItem(HIDE_LEGACY_NAV_KEY, "1");
    else window.localStorage.removeItem(HIDE_LEGACY_NAV_KEY);
  } catch {
    /* ignore */
  }
  dispatchPrefs();
}

/** Default true so existing installs keep sample fill until turned off. */
export function loadUseNmacTestData(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(USE_NMAC_TEST_DATA_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export function saveUseNmacTestData(use: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (use) {
      window.localStorage.removeItem(USE_NMAC_TEST_DATA_KEY);
    } else {
      window.localStorage.setItem(USE_NMAC_TEST_DATA_KEY, "0");
      /** Drop persisted sample (or any) month rows so charts do not keep showing old auto-filled values. */
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
  dispatchPrefs(use ? undefined : { reloadNmacFromServer: true });
}

/** Removes cached FY month actuals for NMAC charts in this browser (not Supabase). */
export function clearNmacMonthlyLocalCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  dispatchPrefs({ reloadNmacFromServer: true });
}
