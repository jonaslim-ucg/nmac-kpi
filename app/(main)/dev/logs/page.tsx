"use client";

import { ChevronDown, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { MainShell } from "@/components/dashboard/main-shell";
import { useSession } from "@/components/auth/session-provider";
import { Snackbar, type SnackbarVariant } from "@/components/ui/snackbar";
import { DEV_LOG_LEVELS, type DevLogEntry, type DevLogLevel } from "@/lib/dev/logs";
import { canAccessDev } from "@/lib/auth/types";

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground transition placeholder:text-muted-foreground/60 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:opacity-50";

const selectClass =
  "h-10 cursor-pointer rounded-lg border border-border bg-background px-3 text-sm capitalize text-foreground transition focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

function levelBadgeClass(level: DevLogLevel): string {
  switch (level) {
    case "error":
      return "bg-red-500/15 text-red-600 dark:text-red-400";
    case "warn":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "debug":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-400";
    default:
      return "bg-accent/15 text-accent";
  }
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs >= 0 && diffMs < 60_000) return "Just now";
    if (diffMs >= 0 && diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs >= 0 && diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

function sourceLabel(source: string | null): string {
  if (!source) return "manual";
  if (source === "auth") return "Sign in/out";
  if (source.startsWith("kpi.")) return "KPI";
  if (source.startsWith("admin.")) return "Admin";
  return source;
}

type LogsResponse = {
  logs?: DevLogEntry[];
  error?: string;
  setupRequired?: boolean;
  setupSql?: string;
};

export default function DevLogsPage() {
  const { user, loading } = useSession();
  const [rows, setRows] = useState<DevLogEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupSql, setSetupSql] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showAddNote, setShowAddNote] = useState(false);
  const [level, setLevel] = useState<DevLogLevel>("info");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [snackbar, setSnackbar] = useState<{ text: string; variant: SnackbarVariant } | null>(null);

  const show = useCallback((text: string, variant: SnackbarVariant) => {
    setSnackbar({ text, variant });
  }, []);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    setLoadError(null);
    setSetupRequired(false);
    try {
      const r = await fetch("/api/dev/logs?limit=200", { credentials: "include", cache: "no-store" });
      const j = (await r.json()) as LogsResponse;
      if (j.setupRequired) {
        setSetupRequired(true);
        setSetupSql(j.setupSql ?? null);
        setLoadError(j.error ?? "Logging is not set up in Supabase yet.");
        setRows([]);
        return;
      }
      if (!r.ok) {
        setLoadError(j.error ?? "Could not load logs.");
        setRows([]);
        return;
      }
      setRows(j.logs ?? []);
    } catch {
      setLoadError("Could not load logs.");
      setRows([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && canAccessDev(user?.role)) void refresh();
  }, [user?.role, loading, refresh]);

  useEffect(() => {
    if (!canAccessDev(user?.role) || setupRequired) return;
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [user?.role, setupRequired, refresh]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) set.add(row.source?.trim() || "manual");
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (sourceFilter === "all") return rows;
    return rows.filter((row) => (row.source?.trim() || "manual") === sourceFilter);
  }, [rows, sourceFilter]);

  async function addLog(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSnackbar(null);
    try {
      const r = await fetch("/api/dev/logs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, message: message.trim(), source: "manual" }),
      });
      const j = (await r.json()) as LogsResponse;
      if (j.setupRequired) {
        setSetupRequired(true);
        setSetupSql(j.setupSql ?? null);
        show(j.error ?? "Run the database setup first.", "error");
        return;
      }
      if (!r.ok) {
        show(j.error ?? "Could not add note.", "error");
        return;
      }
      setMessage("");
      setShowAddNote(false);
      show("Note added.", "success");
      await refresh();
    } catch {
      show("Could not add note.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function clearLogs() {
    if (!window.confirm("Clear all log entries? This cannot be undone.")) return;
    setClearing(true);
    setSnackbar(null);
    try {
      const r = await fetch("/api/dev/logs", { method: "DELETE", credentials: "include" });
      const j = (await r.json()) as LogsResponse;
      if (!r.ok) {
        show(j.error ?? "Could not clear logs.", "error");
        return;
      }
      show("Logs cleared.", "success");
      await refresh();
    } catch {
      show("Could not clear logs.", "error");
    } finally {
      setClearing(false);
    }
  }

  if (loading) {
    return (
      <MainShell title="Logs" subtitle="Loading">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </MainShell>
    );
  }

  if (!canAccessDev(user?.role)) {
    return (
      <MainShell title="Logs" subtitle="Restricted">
        <p className="text-sm text-muted-foreground">You need the Dev role to view logs.</p>
      </MainShell>
    );
  }

  return (
    <MainShell title="Logs" subtitle="Sign-ins, KPI saves, and admin actions">
      <Snackbar
        message={snackbar?.text ?? null}
        variant={snackbar?.variant ?? "success"}
        onDismiss={() => setSnackbar(null)}
      />

      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        {setupRequired ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 sm:px-5">
            <p className="text-sm font-medium text-foreground">Automatic logging is not set up yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Run this once in the Supabase SQL Editor. After that, sign-ins, KPI saves, and admin changes will appear
              here automatically.
            </p>
            {setupSql ? (
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-border bg-background/80 p-3 text-[11px] leading-relaxed text-foreground">
                {setupSql}
              </pre>
            ) : null}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-muted/40 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-foreground">
                {loadingList ? "Loading…" : `${filteredRows.length} ${filteredRows.length === 1 ? "event" : "events"}`}
              </p>
              <label className="flex items-center gap-2">
                <span className="sr-only">Filter by source</span>
                <select
                  className={selectClass + " min-w-[8.5rem] text-xs capitalize"}
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  disabled={loadingList || rows.length === 0}
                >
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s === "all" ? "All sources" : sourceLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddNote((v) => !v)}
                disabled={setupRequired}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-surface-muted/80 disabled:pointer-events-none disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add note
                <ChevronDown
                  className={"h-3.5 w-3.5 transition " + (showAddNote ? "rotate-180" : "")}
                  aria-hidden
                />
              </button>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loadingList}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-surface-muted/80 disabled:pointer-events-none disabled:opacity-50"
              >
                {loadingList ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                )}
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void clearLogs()}
                disabled={clearing || loadingList || rows.length === 0 || setupRequired}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-surface-muted/80 disabled:pointer-events-none disabled:opacity-50"
              >
                {clearing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                )}
                Clear
              </button>
            </div>
          </div>

          {showAddNote ? (
            <form
              onSubmit={addLog}
              className="flex flex-col gap-3 border-b border-border bg-surface-muted/20 px-4 py-3 sm:flex-row sm:items-end sm:px-5"
            >
              <label className="flex w-28 shrink-0 flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Level</span>
                <select className={selectClass} value={level} onChange={(e) => setLevel(e.target.value as DevLogLevel)}>
                  {DEV_LOG_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 flex-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Note</span>
                <input
                  required
                  className={inputClass + " mt-1"}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Optional manual note…"
                />
              </label>
              <button
                type="submit"
                disabled={saving || !message.trim() || setupRequired}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition hover:opacity-95 disabled:pointer-events-none disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Save note
              </button>
            </form>
          ) : null}

          {loadError && !setupRequired ? (
            <p className="px-5 py-6 text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : loadingList ? (
            <div className="space-y-0 px-5 py-4" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4 border-b border-border/60 py-3 last:border-0">
                  <div className="h-4 w-16 animate-pulse rounded bg-muted-foreground/10" />
                  <div className="h-4 w-20 animate-pulse rounded bg-muted-foreground/10" />
                  <div className="h-4 flex-1 animate-pulse rounded bg-muted-foreground/15" />
                  <div className="h-4 w-32 animate-pulse rounded bg-muted-foreground/10" />
                </div>
              ))}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="text-sm font-medium text-foreground">
                {setupRequired ? "Set up the database to start logging" : "No activity yet"}
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                {setupRequired
                  ? "Copy the SQL above into Supabase, then sign in again or save KPI data to generate entries."
                  : "Events appear here when someone signs in, saves KPI data, or an admin changes users or access."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/30">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Time
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Source
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Event
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      User
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/70 transition-colors hover:bg-surface-muted/25"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground" title={row.created_at}>
                        {formatWhen(row.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{sourceLabel(row.source)}</span>
                          <span
                            className={
                              "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                              levelBadgeClass(row.level)
                            }
                          >
                            {row.level}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[min(32rem,45vw)] px-4 py-3">
                        <span className="block text-foreground">{row.message}</span>
                        {row.context && Object.keys(row.context).length > 0 ? (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {JSON.stringify(row.context)}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {row.created_by_email ?? "—"}
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
