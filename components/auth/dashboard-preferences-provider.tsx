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
import type { CustomRole } from "@/lib/auth/custom-roles";
import type { NmacNavViewId, RoleNmacNavAccess } from "@/lib/auth/role-nmac-nav";
import { DEFAULT_HIDDEN_NMAC_KPI_IDS } from "@/lib/kpi-nmac-2026/model";
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
  hiddenNmacKpiIds: string[];
  roleNmacNav: RoleNmacNavAccess;
  customRoles: CustomRole[];
  setHideLegacyNav: (next: boolean) => Promise<void>;
  setUseNmacTestData: (next: boolean) => Promise<void>;
  setHiddenNmacKpiIds: (next: string[]) => Promise<boolean>;
  setRoleNmacNavForRole: (roleId: string, viewIds: NmacNavViewId[] | null) => Promise<void>;
  createCustomRole: (input: { label: string; canEditKpiData: boolean }) => Promise<CustomRole | null>;
  deleteCustomRole: (roleId: string) => Promise<boolean>;
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
  const [hiddenNmacKpiIds, setHiddenNmacKpiIdsState] = useState<string[]>(
    initialPreferences?.hiddenNmacKpiIds ?? [...DEFAULT_HIDDEN_NMAC_KPI_IDS],
  );
  const [roleNmacNav, setRoleNmacNavState] = useState<RoleNmacNavAccess>(initialPreferences?.roleNmacNav ?? {});
  const [customRoles, setCustomRolesState] = useState<CustomRole[]>(initialPreferences?.customRoles ?? []);

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
    setHiddenNmacKpiIdsState(prefs.hiddenNmacKpiIds);
    setRoleNmacNavState(prefs.roleNmacNav);
    setCustomRolesState(prefs.customRoles);
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
      queueMicrotask(() => {
        setHideLegacyNavState(legacy.hideLegacyNav);
        setUseNmacTestDataState(legacy.useNmacTestData);
        setHiddenNmacKpiIdsState([...DEFAULT_HIDDEN_NMAC_KPI_IDS]);
        setCanEdit(false);
        setCanClearCache(false);
        setReady(true);
      });
      return;
    }

    let cancelled = false;
    const hasInitialPrefs = Boolean(initialPreferences);

    if (!hasInitialPrefs) {
      queueMicrotask(() => setReady(false));
    }

    void (async () => {
      const ok = await loadFromServer();
      if (cancelled) return;
      if (!ok) {
        const legacy = readLegacyLocalPrefs();
        setHideLegacyNavState(legacy.hideLegacyNav);
        setUseNmacTestDataState(legacy.useNmacTestData);
        setHiddenNmacKpiIdsState([...DEFAULT_HIDDEN_NMAC_KPI_IDS]);
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
      if (!canEdit) return false;
      const res = await patchPreferences(patch);
      if (!res?.preferences) return false;
      setCanEdit(res.canEdit ?? true);
      applyServerPrefs(res.preferences);
      if (patch.clear_nmac_month_cache === true) {
        clearNmacMonthlyLocalCacheOnly();
        writeLocalCacheRevision(GLOBAL_CACHE_REVISION_KEY, res.preferences.nmacMonthCacheRevision);
      }
      dispatchPrefs(detail);
      return true;
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

  const setHiddenNmacKpiIds = useCallback(
    async (next: string[]) => {
      if (!canEdit) return false;
      const prev = hiddenNmacKpiIds;
      setHiddenNmacKpiIdsState(next);
      const ok = await persist({ hidden_nmac_kpi_ids: next });
      if (!ok) setHiddenNmacKpiIdsState(prev);
      return ok;
    },
    [canEdit, hiddenNmacKpiIds, persist],
  );

  const setRoleNmacNavForRole = useCallback(
    async (roleId: string, viewIds: NmacNavViewId[] | null) => {
      if (!canEdit) return;
      const next: RoleNmacNavAccess = { ...roleNmacNav };
      if (!viewIds || viewIds.length === 0) {
        delete next[roleId];
      } else {
        next[roleId] = viewIds;
      }
      setRoleNmacNavState(next);
      await persist({ role_nmac_nav: next });
    },
    [canEdit, persist, roleNmacNav],
  );

  const createCustomRole = useCallback(
    async (input: { label: string; canEditKpiData: boolean }) => {
      if (!canEdit) return null;
      const r = await fetch("/api/admin/roles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const j = (await r.json()) as { role?: CustomRole; customRoles?: CustomRole[]; error?: string };
      if (!r.ok || !j.role || !j.customRoles) return null;
      setCustomRolesState(j.customRoles);
      await loadFromServer();
      return j.role;
    },
    [canEdit, loadFromServer],
  );

  const deleteCustomRole = useCallback(
    async (roleId: string) => {
      if (!canEdit) return false;
      const r = await fetch(`/api/admin/roles?id=${encodeURIComponent(roleId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await r.json()) as { customRoles?: CustomRole[] };
      if (!r.ok || !j.customRoles) return false;
      setCustomRolesState(j.customRoles);
      await loadFromServer();
      return true;
    },
    [canEdit, loadFromServer],
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
      hiddenNmacKpiIds,
      roleNmacNav,
      customRoles,
      setHideLegacyNav,
      setUseNmacTestData,
      setHiddenNmacKpiIds,
      setRoleNmacNavForRole,
      createCustomRole,
      deleteCustomRole,
      clearNmacMonthCache,
      refresh,
    }),
    [
      ready,
      canEdit,
      canClearCache,
      hideLegacyNav,
      useNmacTestData,
      hiddenNmacKpiIds,
      roleNmacNav,
      customRoles,
      setHideLegacyNav,
      setUseNmacTestData,
      setHiddenNmacKpiIds,
      setRoleNmacNavForRole,
      createCustomRole,
      deleteCustomRole,
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
