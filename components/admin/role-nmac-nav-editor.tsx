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
  type RoleNmacNavAccess,
} from "@/lib/auth/role-nmac-nav";

type Props = {
  onSaved?: (text: string) => void;
  onError?: (text: string) => void;
};

const CONFIGURABLE_ROLES = configurableRolesForNmacNav();
const ALL_VIEW_IDS = NMAC_NAV_ITEMS.map((item) => item.id);

type DraftByRole = Record<AppRole, Set<NmacNavViewId>>;

function allowListToSet(role: AppRole, roleNmacNav: RoleNmacNavAccess): Set<NmacNavViewId> {
  const list = getRoleNmacNavAllowList(role, roleNmacNav);
  return new Set(list ?? ALL_VIEW_IDS);
}

function draftFromAccess(roleNmacNav: RoleNmacNavAccess): DraftByRole {
  const out = {} as DraftByRole;
  for (const role of CONFIGURABLE_ROLES) {
    out[role] = allowListToSet(role, roleNmacNav);
  }
  return out;
}

function roleDraftIsDirty(role: AppRole, draft: Set<NmacNavViewId>, roleNmacNav: RoleNmacNavAccess): boolean {
  const saved = getRoleNmacNavAllowList(role, roleNmacNav);
  const current = saved ?? ALL_VIEW_IDS;
  if (current.length !== draft.size) return true;
  return current.some((id) => !draft.has(id));
}

export function RoleNmacNavEditor({ onSaved, onError }: Props) {
  const { ready, canEdit, roleNmacNav, setRoleNmacNavForRole } = useDashboardPreferences();
  const [draftByRole, setDraftByRole] = useState<DraftByRole>(() => draftFromAccess({}));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setDraftByRole(draftFromAccess(roleNmacNav));
  }, [ready, roleNmacNav]);

  const dirtyRoles = useMemo(
    () => CONFIGURABLE_ROLES.filter((role) => roleDraftIsDirty(role, draftByRole[role], roleNmacNav)),
    [draftByRole, roleNmacNav],
  );
  const dirty = dirtyRoles.length > 0;

  const toggleItem = useCallback((role: AppRole, id: NmacNavViewId) => {
    setDraftByRole((prev) => {
      const next = new Set(prev[role]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [role]: next };
    });
  }, []);

  const selectAllForRole = useCallback((role: AppRole) => {
    setDraftByRole((prev) => ({ ...prev, [role]: new Set(ALL_VIEW_IDS) }));
  }, []);

  const clearAllForRole = useCallback((role: AppRole) => {
    setDraftByRole((prev) => ({ ...prev, [role]: new Set() }));
  }, []);

  const resetRoleToAll = useCallback(
    async (role: AppRole) => {
      if (!canEdit || saving) return;
      setSaving(true);
      try {
        await setRoleNmacNavForRole(role, null);
        onSaved?.(`${role} can see all Master KPI pages.`);
      } catch {
        onError?.("Could not reset role access.");
      } finally {
        setSaving(false);
      }
    },
    [canEdit, onError, onSaved, saving, setRoleNmacNavForRole],
  );

  const save = useCallback(async () => {
    if (!canEdit || saving || !dirty) return;

    for (const role of dirtyRoles) {
      const draft = draftByRole[role];
      if (draft.size === 0) {
        onError?.(`Choose at least one page for ${role}, or use “Show all” in that column.`);
        return;
      }
    }

    setSaving(true);
    try {
      for (const role of dirtyRoles) {
        const draft = draftByRole[role];
        const allSelected = draft.size === ALL_VIEW_IDS.length;
        await setRoleNmacNavForRole(role, allSelected ? null : [...draft]);
      }
      onSaved?.(dirtyRoles.length === 1 ? `${dirtyRoles[0]} access updated.` : "Role access updated.");
    } catch {
      onError?.("Could not save role access.");
    } finally {
      setSaving(false);
    }
  }, [canEdit, dirty, dirtyRoles, draftByRole, onError, onSaved, saving, setRoleNmacNavForRole]);

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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted/30">
              <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Page
              </th>
              {CONFIGURABLE_ROLES.map((role) => {
                const restricted = getRoleNmacNavAllowList(role, roleNmacNav) !== null;
                return (
                  <th
                    key={role}
                    className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    <span className="capitalize">{role}</span>
                    {restricted ? (
                      <span className="ml-1.5 inline-flex rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-accent">
                        Custom
                      </span>
                    ) : null}
                  </th>
                );
              })}
            </tr>
            <tr className="border-b border-border/70 bg-surface-muted/15">
              <td className="px-4 py-2 text-xs text-muted-foreground">Toggle access</td>
              {CONFIGURABLE_ROLES.map((role) => {
                const restricted = getRoleNmacNavAllowList(role, roleNmacNav) !== null;
                return (
                  <td key={role} className="px-4 py-2 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
                      <button
                        type="button"
                        onClick={() => selectAllForRole(role)}
                        className="font-medium text-accent hover:underline"
                      >
                        All
                      </button>
                      <span className="text-muted-foreground/50" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => clearAllForRole(role)}
                        className="font-medium text-accent hover:underline"
                      >
                        None
                      </button>
                      {restricted ? (
                        <>
                          <span className="text-muted-foreground/50" aria-hidden>
                            ·
                          </span>
                          <button
                            type="button"
                            disabled={!canEdit || saving}
                            onClick={() => void resetRoleToAll(role)}
                            className="font-medium text-muted-foreground hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
                          >
                            Reset
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {NMAC_NAV_ITEMS.map((item) => (
              <tr
                key={item.id}
                className="border-b border-border/70 transition-colors hover:bg-surface-muted/25"
              >
                <td className="px-4 py-3 font-medium text-foreground">{item.label}</td>
                {CONFIGURABLE_ROLES.map((role) => {
                  const checked = draftByRole[role].has(item.id);
                  return (
                    <td key={role} className="px-4 py-3 text-center align-middle">
                      <label className="inline-flex cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItem(role, item.id)}
                          aria-label={`${item.label} for ${role}`}
                          className="h-4 w-4 rounded border-border text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
                        />
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <p className="text-xs text-muted-foreground">
          {dirty
            ? `Unsaved changes for ${dirtyRoles.map((r) => r).join(", ")}.`
            : "All changes saved."}
        </p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canEdit || saving || !dirty}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save access
        </button>
      </div>
    </>
  );
}
