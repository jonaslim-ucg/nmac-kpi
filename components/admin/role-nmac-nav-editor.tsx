"use client";

import { Eye, Loader2, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";
import { formatRoleLabel } from "@/lib/auth/types";
import {
  configurableRolesForNmacNav,
  getRoleNmacNavAllowList,
  isCustomNavRole,
  NMAC_NAV_ITEMS,
  type NmacNavViewId,
  type RoleNmacNavAccess,
} from "@/lib/auth/role-nmac-nav";

type Props = {
  onSaved?: (text: string) => void;
  onError?: (text: string) => void;
};

const ALL_VIEW_IDS = NMAC_NAV_ITEMS.map((item) => item.id);

type DraftByRole = Record<string, Set<NmacNavViewId>>;

function allowListToSet(roleId: string, roleNmacNav: RoleNmacNavAccess): Set<NmacNavViewId> {
  const list = getRoleNmacNavAllowList(roleId, roleNmacNav);
  return new Set(list ?? ALL_VIEW_IDS);
}

function draftFromAccess(roleIds: string[], roleNmacNav: RoleNmacNavAccess): DraftByRole {
  const out: DraftByRole = {};
  for (const roleId of roleIds) {
    out[roleId] = allowListToSet(roleId, roleNmacNav);
  }
  return out;
}

function roleDraftIsDirty(
  roleId: string,
  draft: Set<NmacNavViewId>,
  roleNmacNav: RoleNmacNavAccess,
): boolean {
  const saved = getRoleNmacNavAllowList(roleId, roleNmacNav);
  const current = saved ?? ALL_VIEW_IDS;
  if (current.length !== draft.size) return true;
  return current.some((id) => !draft.has(id));
}

export function RoleNmacNavEditor({ onSaved, onError }: Props) {
  const {
    ready,
    canEdit,
    roleNmacNav,
    customRoles,
    setRoleNmacNavForRole,
    createCustomRole,
    deleteCustomRole,
  } = useDashboardPreferences();
  const roleIds = useMemo(() => configurableRolesForNmacNav(customRoles), [customRoles]);
  const [draftByRole, setDraftByRole] = useState<DraftByRole>(() => draftFromAccess(roleIds, {}));
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newRoleCanEdit, setNewRoleCanEdit] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setDraftByRole((prev) => {
      const next = draftFromAccess(roleIds, roleNmacNav);
      for (const roleId of roleIds) {
        if (prev[roleId] && !roleDraftIsDirty(roleId, prev[roleId], roleNmacNav)) {
          next[roleId] = prev[roleId];
        }
      }
      return next;
    });
  }, [ready, roleNmacNav, roleIds]);

  const dirtyRoles = useMemo(
    () => roleIds.filter((roleId) => roleDraftIsDirty(roleId, draftByRole[roleId] ?? new Set(), roleNmacNav)),
    [draftByRole, roleIds, roleNmacNav],
  );
  const dirty = dirtyRoles.length > 0;

  const toggleItem = useCallback((roleId: string, id: NmacNavViewId) => {
    setDraftByRole((prev) => {
      const next = new Set(prev[roleId] ?? ALL_VIEW_IDS);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [roleId]: next };
    });
  }, []);

  const selectAllForRole = useCallback((roleId: string) => {
    setDraftByRole((prev) => ({ ...prev, [roleId]: new Set(ALL_VIEW_IDS) }));
  }, []);

  const clearAllForRole = useCallback((roleId: string) => {
    setDraftByRole((prev) => ({ ...prev, [roleId]: new Set() }));
  }, []);

  const resetRoleToAll = useCallback(
    async (roleId: string) => {
      if (!canEdit || saving) return;
      setSaving(true);
      try {
        await setRoleNmacNavForRole(roleId, null);
        onSaved?.(`${formatRoleLabel(roleId, customRoles)} can see all Master KPI pages.`);
      } catch {
        onError?.("Could not reset role access.");
      } finally {
        setSaving(false);
      }
    },
    [canEdit, customRoles, onError, onSaved, saving, setRoleNmacNavForRole],
  );

  const save = useCallback(async () => {
    if (!canEdit || saving || !dirty) return;

    for (const roleId of dirtyRoles) {
      const draft = draftByRole[roleId] ?? new Set();
      if (draft.size === 0) {
        onError?.(
          `Choose at least one page for ${formatRoleLabel(roleId, customRoles)}, or use “Show all” in that column.`,
        );
        return;
      }
    }

    setSaving(true);
    try {
      for (const roleId of dirtyRoles) {
        const draft = draftByRole[roleId] ?? new Set();
        const allSelected = draft.size === ALL_VIEW_IDS.length;
        await setRoleNmacNavForRole(roleId, allSelected ? null : [...draft]);
      }
      onSaved?.(
        dirtyRoles.length === 1
          ? `${formatRoleLabel(dirtyRoles[0], customRoles)} access updated.`
          : "Role access updated.",
      );
    } catch {
      onError?.("Could not save role access.");
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    customRoles,
    dirty,
    dirtyRoles,
    draftByRole,
    onError,
    onSaved,
    saving,
    setRoleNmacNavForRole,
  ]);

  const submitCreateRole = useCallback(async () => {
    const label = newRoleLabel.trim();
    if (!canEdit || creatingRole || label.length < 2) return;
    setCreatingRole(true);
    try {
      const role = await createCustomRole({ label, canEditKpiData: newRoleCanEdit });
      if (!role) {
        onError?.("Could not create role.");
        return;
      }
      setNewRoleLabel("");
      setNewRoleCanEdit(false);
      setShowCreateForm(false);
      onSaved?.(`Created role “${role.label}”. Assign it to users in the directory above.`);
    } catch {
      onError?.("Could not create role.");
    } finally {
      setCreatingRole(false);
    }
  }, [canEdit, createCustomRole, creatingRole, newRoleCanEdit, newRoleLabel, onError, onSaved]);

  const removeRole = useCallback(
    async (roleId: string) => {
      if (!canEdit || deletingRoleId) return;
      const label = formatRoleLabel(roleId, customRoles);
      if (!window.confirm(`Remove role “${label}”? This cannot be undone.`)) return;
      setDeletingRoleId(roleId);
      try {
        const ok = await deleteCustomRole(roleId);
        if (!ok) {
          onError?.("Could not remove role. Make sure no users still have this role.");
          return;
        }
        onSaved?.(`Removed role “${label}”.`);
      } catch {
        onError?.("Could not remove role.");
      } finally {
        setDeletingRoleId(null);
      }
    },
    [canEdit, customRoles, deleteCustomRole, deletingRoleId, onError, onSaved],
  );

  if (!ready) {
    return <p className="px-5 py-4 text-sm text-muted-foreground">Loading access settings…</p>;
  }

  return (
    <>
      <div className="flex items-start gap-3 border-b border-border bg-surface-muted/40 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-accent">
          <Eye className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Master KPI access by role</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Choose which NMAC master KPI and survey result pages each role can open in the sidebar. Admin and
            Developer roles always see everything.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setShowCreateForm((open) => !open)}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-surface-muted/80"
          >
            {showCreateForm ? <X className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
            {showCreateForm ? "Cancel" : "Add role"}
          </button>
        ) : null}
      </div>

      {showCreateForm ? (
        <div className="border-b border-border bg-surface-muted/20 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">New role name</span>
              <input
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition placeholder:text-muted-foreground/60 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
                value={newRoleLabel}
                onChange={(e) => setNewRoleLabel(e.target.value)}
                placeholder="e.g. Finance team"
                maxLength={64}
              />
            </label>
            <label className="inline-flex items-center gap-2 pb-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={newRoleCanEdit}
                onChange={(e) => setNewRoleCanEdit(e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
              />
              Can edit KPI data
            </label>
            <button
              type="button"
              disabled={creatingRole || newRoleLabel.trim().length < 2}
              onClick={() => void submitCreateRole()}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {creatingRole ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Create role
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            New roles appear as a column below. Assign them to users in the directory above.
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted/30">
              <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Page
              </th>
              {roleIds.map((roleId) => {
                const restricted = getRoleNmacNavAllowList(roleId, roleNmacNav) !== null;
                const custom = isCustomNavRole(roleId, customRoles);
                return (
                  <th
                    key={roleId}
                    className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    <div className="inline-flex items-center justify-center gap-1.5">
                      <span>{formatRoleLabel(roleId, customRoles)}</span>
                      {custom && canEdit ? (
                        <button
                          type="button"
                          disabled={Boolean(deletingRoleId)}
                          onClick={() => void removeRole(roleId)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                          aria-label={`Remove ${formatRoleLabel(roleId, customRoles)} role`}
                          title="Remove role"
                        >
                          {deletingRoleId === roleId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                      ) : null}
                    </div>
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
              {roleIds.map((roleId) => {
                const restricted = getRoleNmacNavAllowList(roleId, roleNmacNav) !== null;
                return (
                  <td key={roleId} className="px-4 py-2 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
                      <button
                        type="button"
                        onClick={() => selectAllForRole(roleId)}
                        className="font-medium text-accent hover:underline"
                      >
                        All
                      </button>
                      <span className="text-muted-foreground/50" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => clearAllForRole(roleId)}
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
                            onClick={() => void resetRoleToAll(roleId)}
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
                {roleIds.map((roleId) => {
                  const checked = (draftByRole[roleId] ?? new Set()).has(item.id);
                  return (
                    <td key={roleId} className="px-4 py-3 text-center align-middle">
                      <label className="inline-flex cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItem(roleId, item.id)}
                          aria-label={`${item.label} for ${formatRoleLabel(roleId, customRoles)}`}
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
            ? `Unsaved changes for ${dirtyRoles.map((roleId) => formatRoleLabel(roleId, customRoles)).join(", ")}.`
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
