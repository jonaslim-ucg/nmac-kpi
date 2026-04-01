"use client";

import { useCallback, useEffect, useState } from "react";
import { MainShell } from "@/components/dashboard/main-shell";
import { useSession } from "@/components/auth/session-provider";
import { Snackbar, type SnackbarVariant } from "@/components/ui/snackbar";
import type { AppRole } from "@/lib/auth/types";
import { canManageUsers } from "@/lib/auth/types";

type Row = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: AppRole;
  created_at: string;
  updated_at: string;
};

const ROLES: AppRole[] = ["viewer", "editor", "admin"];

export default function AdminUsersPage() {
  const { user, loading } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("viewer");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ text: string; variant: SnackbarVariant } | null>(null);
  /** One cell in the table: plain text until clicked, then input until blur. */
  const [nameEditor, setNameEditor] = useState<null | { id: string; field: "first" | "last" }>(null);
  const [nameDraft, setNameDraft] = useState("");

  const show = useCallback((text: string, variant: SnackbarVariant) => {
    setSnackbar({ text, variant });
  }, []);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/admin/users", { credentials: "include" });
      const j = (await r.json()) as { users?: Row[]; error?: string };
      if (!r.ok) {
        setLoadError(j.error ?? "Could not load users.");
        setRows([]);
        return;
      }
      setRows(j.users ?? []);
    } catch {
      setLoadError("Could not load users.");
      setRows([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && canManageUsers(user?.role)) void refresh();
  }, [user?.role, loading, refresh]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setSnackbar(null);
    setSavingId("__new__");
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          role: newRole,
          first_name: newFirst.trim() || undefined,
          last_name: newLast.trim() || undefined,
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        show(j.error ?? "Could not add user.", "error");
        return;
      }
      setNewEmail("");
      setNewFirst("");
      setNewLast("");
      show("User saved.", "success");
      await refresh();
    } catch {
      show("Could not add user.", "error");
    } finally {
      setSavingId(null);
    }
  }

  async function updateRole(id: string, role: AppRole) {
    setSnackbar(null);
    setSavingId(id);
    try {
      const r = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        show(j.error ?? "Could not update role.", "error");
        return;
      }
      show("Role updated.", "success");
      await refresh();
    } catch {
      show("Could not update role.", "error");
    } finally {
      setSavingId(null);
    }
  }

  async function updateUserNames(id: string, first_name: string | null, last_name: string | null) {
    setSnackbar(null);
    setSavingId(id);
    try {
      const r = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name, last_name }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        show(j.error ?? "Could not update name.", "error");
        return;
      }
      show("Name updated.", "success");
      await refresh();
    } catch {
      show("Could not update name.", "error");
    } finally {
      setSavingId(null);
    }
  }

  function beginNameEdit(row: Row, field: "first" | "last") {
    setNameEditor({ id: row.id, field });
    setNameDraft(field === "first" ? (row.first_name ?? "") : (row.last_name ?? ""));
  }

  function cancelNameEdit() {
    setNameEditor(null);
  }

  if (loading) {
    return (
      <MainShell title="Users" subtitle="Loading">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </MainShell>
    );
  }

  if (!canManageUsers(user?.role)) {
    return (
      <MainShell title="Users" subtitle="Restricted">
        <p className="text-sm text-muted-foreground">You need the Admin role to manage users.</p>
      </MainShell>
    );
  }

  return (
    <MainShell title="Users" subtitle="Create accounts and assign roles">
      <Snackbar
        message={snackbar?.text ?? null}
        variant={snackbar?.variant ?? "success"}
        onDismiss={() => setSnackbar(null)}
      />

      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <form
          onSubmit={addUser}
          className="rounded-xl border border-border bg-card p-5"
        >
          <h2 className="text-sm font-semibold text-foreground">Add or invite user</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            If the person has not signed in yet, they will appear here with the role you choose. First sign-in still
            uses email code.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Email</span>
              <input
                type="email"
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="name@organization.com"
              />
            </label>
            <label className="flex min-w-[120px] flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">First name</span>
              <input
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={newFirst}
                onChange={(e) => setNewFirst(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="flex min-w-[120px] flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Last name</span>
              <input
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={newLast}
                onChange={(e) => setNewLast(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="flex w-40 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Role</span>
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as AppRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={savingId === "__new__"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {savingId === "__new__" ? "Saving…" : "Save user"}
            </button>
          </div>
        </form>

        <div>
          <h2 className="text-sm font-semibold text-foreground">All users</h2>
          {loadError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : loadingList ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="mt-3 overflow-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-accent-muted/40">
                    <th className="px-3 py-2 font-medium text-muted-foreground">Email</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">First name</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">Last name</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.id}-${row.updated_at}`} className="border-b border-border/80">
                      <td className="px-3 py-2 font-medium">{row.email}</td>
                      <td className="px-3 py-2 align-middle">
                        {nameEditor?.id === row.id && nameEditor.field === "first" ? (
                          <input
                            autoFocus
                            className="w-full min-w-[120px] rounded-md border border-border bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-accent focus:ring-2"
                            value={nameDraft}
                            disabled={savingId === row.id}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onBlur={() => {
                              const v = nameDraft.trim();
                              const cur = (row.first_name ?? "").trim();
                              cancelNameEdit();
                              if (v === cur) return;
                              void updateUserNames(row.id, v || null, row.last_name);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") cancelNameEdit();
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={savingId === row.id}
                            className="max-w-[220px] truncate rounded px-1.5 py-1 text-left text-sm font-medium text-foreground hover:bg-accent-muted/50 disabled:opacity-50"
                            onClick={() => beginNameEdit(row, "first")}
                          >
                            {(row.first_name ?? "").trim() || "—"}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {nameEditor?.id === row.id && nameEditor.field === "last" ? (
                          <input
                            autoFocus
                            className="w-full min-w-[120px] rounded-md border border-border bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-accent focus:ring-2"
                            value={nameDraft}
                            disabled={savingId === row.id}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onBlur={() => {
                              const v = nameDraft.trim();
                              const cur = (row.last_name ?? "").trim();
                              cancelNameEdit();
                              if (v === cur) return;
                              void updateUserNames(row.id, row.first_name, v || null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") cancelNameEdit();
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={savingId === row.id}
                            className="max-w-[220px] truncate rounded px-1.5 py-1 text-left text-sm font-medium text-foreground hover:bg-accent-muted/50 disabled:opacity-50"
                            onClick={() => beginNameEdit(row, "last")}
                          >
                            {(row.last_name ?? "").trim() || "—"}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="rounded border border-border bg-background px-2 py-1 text-sm capitalize"
                          value={row.role}
                          disabled={savingId === row.id}
                          onChange={(e) => void updateRole(row.id, e.target.value as AppRole)}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No users yet. Add one above.</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </MainShell>
  );
}
