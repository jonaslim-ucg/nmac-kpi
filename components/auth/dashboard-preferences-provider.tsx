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
import type { AppRole } from "@/lib/auth/types";
import type { NmacNavViewId, RoleNmacNavAccess } from "@/lib/auth/role-nmac-nav";
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
  canClearCache: boolean;
  hideLegacyNav: boolean;
  useNmacTestData: boolean;
  roleNmacNav: RoleNmacNavAccess;
  setHideLegacyNav: (next: boolean) => Promise<void>;
  setUseNmacTestData: (next: boolean) => Promise<void>;
  setRoleNmacNavForRole: (role: AppRole, viewIds: NmacNavViewId[] | null) => Promise<void>;
  clearNmacMonthCache: () => Promise<void>;
  refresh: () => Promise<void>;
};

const DashboardPreferencesContext = createContext<Ctx | null>(null);

type PrefsResponse = {
  preferences?: AppDashboardSettings;
  canEdit?: boolean;
  canClearCache?: boolean;
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

export function DashboardPreferencesProvider({
  children,
  initialPreferences = null,
}: {
  children: React.ReactNode;
  initialPreferences?: AppDashboardSettings | null;
}) {
  const { user, loading: sessionLoading } = useSession();
  const [ready, setReady] = useState(Boolean(initialPreferences));
  const [canEdit, setCanEdit] = useState(false);
  const [canClearCache, setCanClearCache] = useState(false);
  const [hideLegacyNav, setHideLegacyNavState] = useState(initialPreferences?.hideLegacyNav ?? false);
  const [useNmacTestData, setUseNmacTestDataState] = useState(initialPreferences?.useNmacTestData ?? true);
  const [roleNmacNav, setRoleNmacNavState] = useState<RoleNmacNavAccess>(initialPreferences?.roleNmacNav ?? {});

  useEffect(() => {
    if (initialPreferences) {
      applySyncedDashboardPrefs(initialPreferences);
    }
  }, [initialPreferences]);

  const applyServerPrefs = useCallback((prefs: AppDashboardSettings) => {
    applySyncedDashboardPrefs(prefs);
    applyCacheRevisionFromServer(prefs.nmacMonthCacheRevision);
    writeLegacyLocalPrefs(prefs.hideLegacyNav, prefs.useNmacTestData);
    setHideLegacyNavState(prefs.hideLegacyNav);
    setUseNmacTestDataState(prefs.useNmacTestData);
    setRoleNmacNavState(prefs.roleNmacNav);
    dispatchPrefs();
  }, []);

  const loadFromServer = useCallback(async () => {
    const res = await fetchPreferences();
    if (!res?.preferences) return false;
    setCanEdit(res.canEdit ?? canManageUsers(user?.role));
    setCanClearCache(res.canClearCache ?? Boolean(user));
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
      setCanClearCache(false);
      setReady(true);
      return;
    }

    let cancelled = false;
    const hasInitialPrefs = Boolean(initialPreferences);

    if (!hasInitialPrefs) {
      setReady(false);
    }

    void (async () => {
      const ok = await loadFromServer();
      if (cancelled) return;
      if (!ok) {
        const legacy = readLegacyLocalPrefs();
        setHideLegacyNavState(legacy.hideLegacyNav);
        setUseNmacTestDataState(legacy.useNmacTestData);
        setCanEdit(canManageUsers(user?.role));
        setCanClearCache(Boolean(user));
        applySyncedDashboardPrefs(null);
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading, loadFromServer, initialPreferences]);

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

  const setRoleNmacNavForRole = useCallback(
    async (role: AppRole, viewIds: NmacNavViewId[] | null) => {
      if (!canEdit) return;
      const next: RoleNmacNavAccess = { ...roleNmacNav };
      if (!viewIds || viewIds.length === 0) {
        delete next[role];
      } else {
        next[role] = viewIds;
      }
      setRoleNmacNavState(next);
      await persist({ role_nmac_nav: next });
    },
    [canEdit, persist, roleNmacNav],
  );

  const clearNmacMonthCache = useCallback(async () => {
    if (!canClearCache) return;
    const res = await patchPreferences({ clear_nmac_month_cache: true });
    if (!res?.preferences) return;
    applyServerPrefs(res.preferences);
    clearNmacMonthlyLocalCacheOnly();
    writeLocalCacheRevision(GLOBAL_CACHE_REVISION_KEY, res.preferences.nmacMonthCacheRevision);
    dispatchPrefs({ reloadNmacFromServer: true });
  }, [canClearCache, applyServerPrefs]);

  const refresh = useCallback(async () => {
    await loadFromServer();
  }, [loadFromServer]);

  const value = useMemo(
    () => ({
      ready,
      canEdit,
      canClearCache,
      hideLegacyNav,
      useNmacTestData,
      roleNmacNav,
      setHideLegacyNav,
      setUseNmacTestData,
      setRoleNmacNavForRole,
      clearNmacMonthCache,
      refresh,
    }),
    [
      ready,
      canEdit,
      canClearCache,
      hideLegacyNav,
      useNmacTestData,
      roleNmacNav,
      setHideLegacyNav,
      setUseNmacTestData,
      setRoleNmacNavForRole,
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
