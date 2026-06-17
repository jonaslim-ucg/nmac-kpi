"use client";

import { Eye, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";
import type { AppRole } from "@/lib/auth/types";
import {
  configurableRolesForNmacNav,
  getRoleNmacNavAllowList,
  NMAC_NAV_ITEMS,
  type NmacNavViewId,
} from "@/lib/auth/role-nmac-nav";

type Props = {
  onSaved?: (text: string) => void;
  onError?: (text: string) => void;
};

const CONFIGURABLE_ROLES = configurableRolesForNmacNav();

export function RoleNmacNavEditor({ onSaved, onError }: Props) {
  const { ready, canEdit, roleNmacNav, setRoleNmacNavForRole } = useDashboardPreferences();
  const [activeRole, setActiveRole] = useState<AppRole>("viewer");
  const [draft, setDraft] = useState<Set<NmacNavViewId>>(new Set());
  const [saving, setSaving] = useState(false);

  const savedAllowList = useMemo(
    () => getRoleNmacNavAllowList(activeRole, roleNmacNav),
    [activeRole, roleNmacNav],
  );

  useEffect(() => {
    if (!ready) return;
    const ids = savedAllowList ?? NMAC_NAV_ITEMS.map((item) => item.id);
    setDraft(new Set(ids));
  }, [ready, activeRole, savedAllowList]);

  const isRestricted = savedAllowList !== null;
  const dirty = useMemo(() => {
    const current = savedAllowList ?? NMAC_NAV_ITEMS.map((item) => item.id);
    if (current.length !== draft.size) return true;
    return current.some((id) => !draft.has(id));
  }, [savedAllowList, draft]);

  const toggleItem = useCallback((id: NmacNavViewId) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setDraft(new Set(NMAC_NAV_ITEMS.map((item) => item.id)));
  }, []);

  const clearAll = useCallback(() => {
    setDraft(new Set());
  }, []);

  const save = useCallback(async () => {
    if (!canEdit || saving) return;
    if (draft.size === 0) {
      onError?.("Choose at least one page, or use “Show all pages” to remove restrictions.");
      return;
    }
    setSaving(true);
    try {
      const allSelected = draft.size === NMAC_NAV_ITEMS.length;
      await setRoleNmacNavForRole(activeRole, allSelected ? null : [...draft]);
      onSaved?.(`${activeRole} access updated.`);
    } catch {
      onError?.("Could not save role access.");
    } finally {
      setSaving(false);
    }
  }, [activeRole, canEdit, draft, onError, onSaved, saving, setRoleNmacNavForRole]);

  const resetToAll = useCallback(async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      await setRoleNmacNavForRole(activeRole, null);
      onSaved?.(`${activeRole} can see all Master KPI pages.`);
    } catch {
      onError?.("Could not reset role access.");
    } finally {
      setSaving(false);
    }
  }, [activeRole, canEdit, onError, onSaved, saving, setRoleNmacNavForRole]);

  if (!ready) {
    return <p className="px-5 py-4 text-sm text-muted-foreground">Loading access settings…</p>;
  }

  return (
    <>
      <div className="flex items-start gap-3 border-b border-border bg-surface-muted/40 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-accent">
          <Eye className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Master KPI access by role</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Choose which NMAC master KPI pages each role can open in the sidebar. Admins always see everything.
          </p>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {CONFIGURABLE_ROLES.map((role) => {
            const active = activeRole === role;
            const restricted = getRoleNmacNavAllowList(role, roleNmacNav) !== null;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setActiveRole(role)}
                className={
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm capitalize transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent " +
                  (active
                    ? "border-accent bg-accent-muted/50 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-surface-muted/80 hover:text-foreground")
                }
              >
                {role}
                {restricted ? (
                  <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                    Custom
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-border bg-background/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              {isRestricted ? (
                <>
                  <span className="capitalize">{activeRole}</span> sees{" "}
                  <span className="font-medium">{savedAllowList?.length ?? 0}</span> of{" "}
                  {NMAC_NAV_ITEMS.length} pages.
                </>
              ) : (
                <>
                  <span className="capitalize">{activeRole}</span> currently sees all Master KPI pages.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={selectAll} className="text-xs font-medium text-accent hover:underline">
                Select all
              </button>
              <button type="button" onClick={clearAll} className="text-xs font-medium text-accent hover:underline">
                Clear all
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {NMAC_NAV_ITEMS.map((item) => {
              const checked = draft.has(item.id);
              return (
                <label
                  key={item.id}
                  className={
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition " +
                    (checked
                      ? "border-accent/40 bg-accent-muted/20"
                      : "border-border hover:bg-surface-muted/50")
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(item.id)}
                    className="mt-0.5 h-4 w-4 rounded border-border text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canEdit || saving || !dirty}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save {activeRole} access
          </button>
          {isRestricted ? (
            <button
              type="button"
              onClick={() => void resetToAll()}
              disabled={!canEdit || saving}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-surface-muted/80 disabled:pointer-events-none disabled:opacity-50"
            >
              Show all pages
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
