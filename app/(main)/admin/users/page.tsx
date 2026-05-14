"use client";

import { Loader2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
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

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition placeholder:text-muted-foreground/60 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:opacity-50";

const selectClass =
  "h-10 w-full min-w-[7.5rem] max-w-[220px] cursor-pointer rounded-lg border border-border bg-background px-3 text-sm capitalize text-foreground transition focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

const selectClassTable =
  "h-10 min-w-[7.5rem] max-w-[11rem] cursor-pointer rounded-lg border border-border bg-background px-3 text-sm capitalize text-foreground transition focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

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

  async function addUser(e: FormEvent) {
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
      show("User added.", "success");
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

  const nameCellBtn =
    "max-w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-foreground transition hover:bg-accent-muted/45 disabled:cursor-not-allowed disabled:opacity-50";

  const nameCellInput =
    "w-full min-w-[8rem] rounded-md border border-border bg-background px-2 py-1.5 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <MainShell title="Users" subtitle="Invite by email and set each person’s access">
      <Snackbar
        message={snackbar?.text ?? null}
        variant={snackbar?.variant ?? "success"}
        onDismiss={() => setSnackbar(null)}
      />

      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
          <div className="flex items-start gap-3 border-b border-border bg-surface-muted/40 px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-accent">
              <UserPlus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Add or invite</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                They appear in the list below with the role you pick. First sign-in still uses a code sent to their
                email.
              </p>
            </div>
          </div>
          <form onSubmit={addUser} className="p-5 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-12 lg:gap-x-5 lg:gap-y-4">
              <label className="flex flex-col gap-1.5 lg:col-span-12">
                <span className="text-xs font-medium text-muted-foreground">Work email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className={inputClass}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@organization.com"
                />
              </label>
              <label className="flex flex-col gap-1.5 lg:col-span-6">
                <span className="text-xs font-medium text-muted-foreground">First name</span>
                <input
                  className={inputClass}
                  value={newFirst}
                  onChange={(e) => setNewFirst(e.target.value)}
                  autoComplete="off"
                  placeholder="Optional"
                />
              </label>
              <label className="flex flex-col gap-1.5 lg:col-span-6">
                <span className="text-xs font-medium text-muted-foreground">Last name</span>
                <input
                  className={inputClass}
                  value={newLast}
                  onChange={(e) => setNewLast(e.target.value)}
                  autoComplete="off"
                  placeholder="Optional"
                />
              </label>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:col-span-12 lg:flex-row lg:items-end">
                <label className="flex w-full flex-col gap-1.5 sm:max-w-[220px]">
                  <span className="text-xs font-medium text-muted-foreground">Role</span>
                  <select
                    className={selectClass}
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
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white shadow-sm transition hover:opacity-95 disabled:pointer-events-none disabled:opacity-50 sm:min-w-[9.5rem] lg:ml-auto"
                >
                  {savingId === "__new__" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {savingId === "__new__" ? "Saving…" : "Add user"}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border bg-surface-muted/40 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-accent">
                <Users className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">Directory</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {loadingList ? "" : `${rows.length} ${rows.length === 1 ? "person" : "people"}`}
                </p>
              </div>
            </div>
          </div>

          {loadError ? (
            <p className="px-5 py-6 text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : loadingList ? (
            <div className="space-y-0 px-5 py-4" aria-busy="true" aria-label="Loading users">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex gap-4 border-b border-border/60 py-3 last:border-0"
                >
                  <div className="h-4 flex-1 animate-pulse rounded bg-muted-foreground/15" />
                  <div className="h-4 w-24 animate-pulse rounded bg-muted-foreground/10" />
                  <div className="h-4 w-24 animate-pulse rounded bg-muted-foreground/10" />
                  <div className="h-9 w-28 animate-pulse rounded-lg bg-muted-foreground/10" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-foreground">No users yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Add someone with the form above. They will sign in with an email code the first time.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/30">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Email
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      First name
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Last name
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Role
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.id}-${row.updated_at}`}
                      className="border-b border-border/70 transition-colors hover:bg-surface-muted/25"
                    >
                      <td className="max-w-[min(28rem,40vw)] px-4 py-3">
                        <span className="block truncate font-medium text-foreground" title={row.email}>
                          {row.email}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {nameEditor?.id === row.id && nameEditor.field === "first" ? (
                          <input
                            autoFocus
                            className={nameCellInput}
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
                            className={nameCellBtn}
                            title="Click to edit"
                            onClick={() => beginNameEdit(row, "first")}
                          >
                            {(row.first_name ?? "").trim() || "—"}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {nameEditor?.id === row.id && nameEditor.field === "last" ? (
                          <input
                            autoFocus
                            className={nameCellInput}
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
                            className={nameCellBtn}
                            title="Click to edit"
                            onClick={() => beginNameEdit(row, "last")}
                          >
                            {(row.last_name ?? "").trim() || "—"}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          <select
                            className={selectClassTable}
                            value={row.role}
                            disabled={savingId === row.id}
                            onChange={(e) => void updateRole(row.id, e.target.value as AppRole)}
                            aria-label={`Role for ${row.email}`}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          {savingId === row.id ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </MainShell>
  );
}
