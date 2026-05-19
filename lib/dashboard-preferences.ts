import { STORAGE_KEY } from "@/lib/kpi-nmac-2026/model";
import type { UserDashboardPreferences } from "@/lib/auth/user-preferences";

export const DASHBOARD_PREFS_EVENT = "kpi-dashboard-prefs";

export type DashboardPrefsDetail = {
  /** Re-run NMAC monthly + targets fetch (e.g. after clearing browser month cache). */
  reloadNmacFromServer?: boolean;
};

const HIDE_LEGACY_NAV_KEY = "kpi_hide_legacy_nav";
const USE_NMAC_TEST_DATA_KEY = "kpi_nmac_use_test_data";
const CACHE_REVISION_KEY_PREFIX = "kpi_nmac_cache_rev:";

let syncedPrefs: UserDashboardPreferences | null = null;

export function applySyncedDashboardPrefs(prefs: UserDashboardPreferences | null) {
  syncedPrefs = prefs;
}

export function dispatchPrefs(detail?: DashboardPrefsDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DashboardPrefsDetail>(DASHBOARD_PREFS_EVENT, { detail: detail ?? {} }));
}

export function readLegacyLocalPrefs(): { hideLegacyNav: boolean; useNmacTestData: boolean } {
  return {
    hideLegacyNav: readLocalHideLegacyNav(),
    useNmacTestData: readLocalUseNmacTestData(),
  };
}

export function writeLegacyLocalPrefs(hideLegacyNav: boolean, useNmacTestData: boolean) {
  writeLocalHideLegacyNav(hideLegacyNav);
  writeLocalUseNmacTestData(useNmacTestData);
}

function readLocalHideLegacyNav(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIDE_LEGACY_NAV_KEY) === "1";
  } catch {
    return false;
  }
}

function writeLocalHideLegacyNav(hide: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (hide) window.localStorage.setItem(HIDE_LEGACY_NAV_KEY, "1");
    else window.localStorage.removeItem(HIDE_LEGACY_NAV_KEY);
  } catch {
    /* ignore */
  }
}

function readLocalUseNmacTestData(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(USE_NMAC_TEST_DATA_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

function writeLocalUseNmacTestData(use: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (use) window.localStorage.removeItem(USE_NMAC_TEST_DATA_KEY);
    else window.localStorage.setItem(USE_NMAC_TEST_DATA_KEY, "0");
  } catch {
    /* ignore */
  }
}

export function readLocalCacheRevision(userKey: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(`${CACHE_REVISION_KEY_PREFIX}${userKey}`);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function writeLocalCacheRevision(userKey: string, revision: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${CACHE_REVISION_KEY_PREFIX}${userKey}`, String(revision));
  } catch {
    /* ignore */
  }
}

/** Account-synced when signed in; falls back to this browser when signed out. */
export function loadHideLegacyNav(): boolean {
  if (syncedPrefs) return syncedPrefs.hideLegacyNav;
  return readLocalHideLegacyNav();
}

export function saveHideLegacyNav(hide: boolean) {
  writeLocalHideLegacyNav(hide);
  if (syncedPrefs) syncedPrefs = { ...syncedPrefs, hideLegacyNav: hide };
  dispatchPrefs();
}

/** Default true so existing installs keep sample fill until turned off. */
export function loadUseNmacTestData(): boolean {
  if (syncedPrefs) return syncedPrefs.useNmacTestData;
  return readLocalUseNmacTestData();
}

export function saveUseNmacTestData(use: boolean) {
  writeLocalUseNmacTestData(use);
  if (!use) clearNmacMonthlyLocalCacheOnly();
  if (syncedPrefs) syncedPrefs = { ...syncedPrefs, useNmacTestData: use };
  dispatchPrefs(use ? undefined : { reloadNmacFromServer: true });
}

/** Removes cached FY month actuals for NMAC charts in this browser (not Supabase). */
export function clearNmacMonthlyLocalCache() {
  clearNmacMonthlyLocalCacheOnly();
  dispatchPrefs({ reloadNmacFromServer: true });
}

export function clearNmacMonthlyLocalCacheOnly() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
