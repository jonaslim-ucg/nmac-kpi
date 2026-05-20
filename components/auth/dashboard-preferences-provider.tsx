"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "@/components/auth/session-provider";
import { canManageUsers } from "@/lib/auth/types";
import type { AppDashboardSettings } from "@/lib/auth/app-settings";
import {
  applySyncedDashboardPrefs,
  clearNmacMonthlyLocalCacheOnly,
  dispatchPrefs,
  GLOBAL_CACHE_REVISION_KEY,
  readLegacyLocalPrefs,
  readLocalCacheRevision,
  writeLocalCacheRevision,
  writeLegacyLocalPrefs,
  type DashboardPrefsDetail,
} from "@/lib/dashboard-preferences";

type Ctx = {
  ready: boolean;
  canEdit: boolean;
  hideLegacyNav: boolean;
  useNmacTestData: boolean;
  setHideLegacyNav: (next: boolean) => Promise<void>;
  setUseNmacTestData: (next: boolean) => Promise<void>;
  clearNmacMonthCache: () => Promise<void>;
  refresh: () => Promise<void>;
};

const DashboardPreferencesContext = createContext<Ctx | null>(null);

type PrefsResponse = {
  preferences?: AppDashboardSettings;
  canEdit?: boolean;
};

async function fetchPreferences(): Promise<PrefsResponse | null> {
  const r = await fetch("/api/auth/preferences", { credentials: "include", cache: "no-store" });
  if (!r.ok) return null;
  return (await r.json()) as PrefsResponse;
}

async function patchPreferences(body: Record<string, unknown>): Promise<PrefsResponse | null> {
  const r = await fetch("/api/auth/preferences", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  return (await r.json()) as PrefsResponse;
}

function applyCacheRevisionFromServer(serverRevision: number) {
  const localRevision = readLocalCacheRevision(GLOBAL_CACHE_REVISION_KEY);
  if (serverRevision > localRevision) {
    clearNmacMonthlyLocalCacheOnly();
    writeLocalCacheRevision(GLOBAL_CACHE_REVISION_KEY, serverRevision);
    dispatchPrefs({ reloadNmacFromServer: true });
  }
}

export function DashboardPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const [ready, setReady] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [hideLegacyNav, setHideLegacyNavState] = useState(false);
  const [useNmacTestData, setUseNmacTestDataState] = useState(true);

  const applyServerPrefs = useCallback((prefs: AppDashboardSettings) => {
    applySyncedDashboardPrefs(prefs);
    applyCacheRevisionFromServer(prefs.nmacMonthCacheRevision);
    writeLegacyLocalPrefs(prefs.hideLegacyNav, prefs.useNmacTestData);
    setHideLegacyNavState(prefs.hideLegacyNav);
    setUseNmacTestDataState(prefs.useNmacTestData);
    dispatchPrefs();
  }, []);

  const loadFromServer = useCallback(async () => {
    const res = await fetchPreferences();
    if (!res?.preferences) return false;
    setCanEdit(res.canEdit ?? canManageUsers(user?.role));
    applyServerPrefs(res.preferences);
    return true;
  }, [applyServerPrefs, user]);

  useEffect(() => {
    if (sessionLoading) return;

    if (!user) {
      applySyncedDashboardPrefs(null);
      const legacy = readLegacyLocalPrefs();
      setHideLegacyNavState(legacy.hideLegacyNav);
      setUseNmacTestDataState(legacy.useNmacTestData);
      setCanEdit(false);
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);

    void (async () => {
      const ok = await loadFromServer();
      if (cancelled) return;
      if (!ok) {
        const legacy = readLegacyLocalPrefs();
        setHideLegacyNavState(legacy.hideLegacyNav);
        setUseNmacTestDataState(legacy.useNmacTestData);
        setCanEdit(canManageUsers(user?.role));
        applySyncedDashboardPrefs(null);
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading, loadFromServer]);

  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadFromServer();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user, loadFromServer]);

  const persist = useCallback(
    async (patch: Record<string, unknown>, detail?: DashboardPrefsDetail) => {
      if (!canEdit) return;
      const res = await patchPreferences(patch);
      if (!res?.preferences) return;
      setCanEdit(res.canEdit ?? true);
      applyServerPrefs(res.preferences);
      if (patch.clear_nmac_month_cache === true) {
        clearNmacMonthlyLocalCacheOnly();
        writeLocalCacheRevision(GLOBAL_CACHE_REVISION_KEY, res.preferences.nmacMonthCacheRevision);
      }
      dispatchPrefs(detail);
    },
    [canEdit, applyServerPrefs],
  );

  const setHideLegacyNav = useCallback(
    async (next: boolean) => {
      if (!canEdit) return;
      setHideLegacyNavState(next);
      await persist({ hide_legacy_nav: next });
    },
    [canEdit, persist],
  );

  const setUseNmacTestData = useCallback(
    async (next: boolean) => {
      if (!canEdit) return;
      setUseNmacTestDataState(next);
      if (!next) clearNmacMonthlyLocalCacheOnly();
      await persist({ use_nmac_test_data: next }, next ? undefined : { reloadNmacFromServer: true });
    },
    [canEdit, persist],
  );

  const clearNmacMonthCache = useCallback(async () => {
    if (!canEdit) return;
    await persist({ clear_nmac_month_cache: true }, { reloadNmacFromServer: true });
  }, [canEdit, persist]);

  const refresh = useCallback(async () => {
    await loadFromServer();
  }, [loadFromServer]);

  const value = useMemo(
    () => ({
      ready,
      canEdit,
      hideLegacyNav,
      useNmacTestData,
      setHideLegacyNav,
      setUseNmacTestData,
      clearNmacMonthCache,
      refresh,
    }),
    [
      ready,
      canEdit,
      hideLegacyNav,
      useNmacTestData,
      setHideLegacyNav,
      setUseNmacTestData,
      clearNmacMonthCache,
      refresh,
    ],
  );

  return <DashboardPreferencesContext.Provider value={value}>{children}</DashboardPreferencesContext.Provider>;
}

export function useDashboardPreferences() {
  const ctx = useContext(DashboardPreferencesContext);
  if (!ctx) throw new Error("useDashboardPreferences must be used within DashboardPreferencesProvider");
  return ctx;
}
