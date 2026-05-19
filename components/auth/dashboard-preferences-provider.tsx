"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "@/components/auth/session-provider";
import type { UserDashboardPreferences } from "@/lib/auth/user-preferences";
import {
  applySyncedDashboardPrefs,
  clearNmacMonthlyLocalCacheOnly,
  DASHBOARD_PREFS_EVENT,
  dispatchPrefs,
  readLegacyLocalPrefs,
  readLocalCacheRevision,
  writeLocalCacheRevision,
  writeLegacyLocalPrefs,
  type DashboardPrefsDetail,
} from "@/lib/dashboard-preferences";

type Ctx = {
  ready: boolean;
  hideLegacyNav: boolean;
  useNmacTestData: boolean;
  setHideLegacyNav: (next: boolean) => Promise<void>;
  setUseNmacTestData: (next: boolean) => Promise<void>;
  clearNmacMonthCache: () => Promise<void>;
};

const DashboardPreferencesContext = createContext<Ctx | null>(null);

const LOCAL_SYNC_KEY = "kpi_prefs_account_synced";

async function fetchPreferences(): Promise<UserDashboardPreferences | null> {
  const r = await fetch("/api/auth/preferences", { credentials: "include", cache: "no-store" });
  if (!r.ok) return null;
  const j = (await r.json()) as { preferences?: UserDashboardPreferences };
  return j.preferences ?? null;
}

async function patchPreferences(body: Record<string, unknown>): Promise<UserDashboardPreferences | null> {
  const r = await fetch("/api/auth/preferences", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { preferences?: UserDashboardPreferences };
  return j.preferences ?? null;
}

function applyCacheRevisionFromServer(userKey: string, serverRevision: number) {
  const localRevision = readLocalCacheRevision(userKey);
  if (serverRevision > localRevision) {
    clearNmacMonthlyLocalCacheOnly();
    writeLocalCacheRevision(userKey, serverRevision);
    dispatchPrefs({ reloadNmacFromServer: true });
  }
}

export function DashboardPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const [ready, setReady] = useState(false);
  const [hideLegacyNav, setHideLegacyNavState] = useState(false);
  const [useNmacTestData, setUseNmacTestDataState] = useState(true);
  const userKeyRef = useRef<string | null>(null);

  const applyServerPrefs = useCallback((prefs: UserDashboardPreferences, userKey: string) => {
    applySyncedDashboardPrefs(prefs);
    applyCacheRevisionFromServer(userKey, prefs.nmacMonthCacheRevision);
    setHideLegacyNavState(prefs.hideLegacyNav);
    setUseNmacTestDataState(prefs.useNmacTestData);
    dispatchPrefs();
  }, []);

  useEffect(() => {
    if (sessionLoading) return;

    if (!user) {
      userKeyRef.current = null;
      applySyncedDashboardPrefs(null);
      const legacy = readLegacyLocalPrefs();
      setHideLegacyNavState(legacy.hideLegacyNav);
      setUseNmacTestDataState(legacy.useNmacTestData);
      setReady(true);
      return;
    }

    const userKey = user.email.trim().toLowerCase();
    userKeyRef.current = userKey;
    let cancelled = false;

    void (async () => {
      setReady(false);
      let prefs = await fetchPreferences();
      if (cancelled) return;

      if (!prefs) {
        const legacy = readLegacyLocalPrefs();
        setHideLegacyNavState(legacy.hideLegacyNav);
        setUseNmacTestDataState(legacy.useNmacTestData);
        applySyncedDashboardPrefs(null);
        setReady(true);
        return;
      }

      try {
        const synced = window.localStorage.getItem(`${LOCAL_SYNC_KEY}:${userKey}`) === "1";
        if (!synced) {
          const legacy = readLegacyLocalPrefs();
          const needsMigrate =
            legacy.hideLegacyNav !== prefs.hideLegacyNav || legacy.useNmacTestData !== prefs.useNmacTestData;
          if (needsMigrate) {
            const migrated = await patchPreferences({
              hide_legacy_nav: legacy.hideLegacyNav,
              use_nmac_test_data: legacy.useNmacTestData,
            });
            if (migrated) prefs = migrated;
          }
          window.localStorage.setItem(`${LOCAL_SYNC_KEY}:${userKey}`, "1");
          writeLegacyLocalPrefs(prefs.hideLegacyNav, prefs.useNmacTestData);
        }
      } catch {
        /* ignore migration errors */
      }

      if (cancelled) return;
      applyServerPrefs(prefs, userKey);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading, applyServerPrefs]);

  const persist = useCallback(
    async (
      patch: Record<string, unknown>,
      detail?: DashboardPrefsDetail,
      localAfter?: { hideLegacyNav: boolean; useNmacTestData: boolean },
    ) => {
      if (!user) return;
      const userKey = userKeyRef.current ?? user.email.trim().toLowerCase();
      const prefs = await patchPreferences(patch);
      if (!prefs) return;
      if (localAfter) writeLegacyLocalPrefs(localAfter.hideLegacyNav, localAfter.useNmacTestData);
      applyServerPrefs(prefs, userKey);
      if (patch.clear_nmac_month_cache === true) {
        clearNmacMonthlyLocalCacheOnly();
        writeLocalCacheRevision(userKey, prefs.nmacMonthCacheRevision);
      }
      dispatchPrefs(detail);
    },
    [user, applyServerPrefs],
  );

  const setHideLegacyNav = useCallback(
    async (next: boolean) => {
      setHideLegacyNavState(next);
      if (!user) {
        writeLegacyLocalPrefs(next, useNmacTestData);
        dispatchPrefs();
        return;
      }
      await persist({ hide_legacy_nav: next }, undefined, { hideLegacyNav: next, useNmacTestData });
    },
    [user, useNmacTestData, persist],
  );

  const setUseNmacTestData = useCallback(
    async (next: boolean) => {
      setUseNmacTestDataState(next);
      if (!user) {
        writeLegacyLocalPrefs(hideLegacyNav, next);
        if (!next) clearNmacMonthlyLocalCacheOnly();
        dispatchPrefs(next ? undefined : { reloadNmacFromServer: true });
        return;
      }
      if (!next) clearNmacMonthlyLocalCacheOnly();
      await persist(
        { use_nmac_test_data: next },
        next ? undefined : { reloadNmacFromServer: true },
        { hideLegacyNav, useNmacTestData: next },
      );
    },
    [user, hideLegacyNav, persist],
  );

  const clearNmacMonthCache = useCallback(async () => {
    if (!user) {
      clearNmacMonthlyLocalCacheOnly();
      dispatchPrefs({ reloadNmacFromServer: true });
      return;
    }
    await persist({ clear_nmac_month_cache: true }, { reloadNmacFromServer: true });
  }, [user, persist]);

  const value = useMemo(
    () => ({
      ready,
      hideLegacyNav,
      useNmacTestData,
      setHideLegacyNav,
      setUseNmacTestData,
      clearNmacMonthCache,
    }),
    [ready, hideLegacyNav, useNmacTestData, setHideLegacyNav, setUseNmacTestData, clearNmacMonthCache],
  );

  return <DashboardPreferencesContext.Provider value={value}>{children}</DashboardPreferencesContext.Provider>;
}

export function useDashboardPreferences() {
  const ctx = useContext(DashboardPreferencesContext);
  if (!ctx) throw new Error("useDashboardPreferences must be used within DashboardPreferencesProvider");
  return ctx;
}
