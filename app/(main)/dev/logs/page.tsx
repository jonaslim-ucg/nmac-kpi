"use client";

import { Loader2, ScrollText, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MainShell } from "@/components/dashboard/main-shell";
import { useSession } from "@/components/auth/session-provider";
import { Snackbar, type SnackbarVariant } from "@/components/ui/snackbar";
import { DEV_LOG_LEVELS, type DevLogEntry, type DevLogLevel } from "@/lib/dev/logs";
import { canAccessDev } from "@/lib/auth/types";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition placeholder:text-muted-foreground/60 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:opacity-50";

const selectClass =
  "h-10 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm capitalize text-foreground transition focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

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
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function DevLogsPage() {
  const { user, loading } = useSession();
  const [rows, setRows] = useState<DevLogEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [level, setLevel] = useState<DevLogLevel>("info");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [snackbar, setSnackbar] = useState<{ text: string; variant: SnackbarVariant } | null>(null);

  const show = useCallback((text: string, variant: SnackbarVariant) => {
    setSnackbar({ text, variant });
  }, []);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/dev/logs?limit=200", { credentials: "include", cache: "no-store" });
      const j = (await r.json()) as { logs?: DevLogEntry[]; error?: string };
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

  async function addLog(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSnackbar(null);
    try {
      const r = await fetch("/api/dev/logs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          message: message.trim(),
          source: source.trim() || undefined,
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        show(j.error ?? "Could not add log.", "error");
        return;
      }
      setMessage("");
      show("Log added.", "success");
      await refresh();
    } catch {
      show("Could not add log.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function clearLogs() {
    if (!window.confirm("Clear all dev logs? This cannot be undone.")) return;
    setClearing(true);
    setSnackbar(null);
    try {
      const r = await fetch("/api/dev/logs", { method: "DELETE", credentials: "include" });
      const j = (await r.json()) as { error?: string };
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
        <p className="text-sm text-muted-foreground">You need the Dev role to view dev logs.</p>
      </MainShell>
    );
  }

  return (
    <MainShell title="Logs" subtitle="Developer notes and debug entries">
      <Snackbar
        message={snackbar?.text ?? null}
        variant={snackbar?.variant ?? "success"}
        onDismiss={() => setSnackbar(null)}
      />

      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
          <div className="flex items-start gap-3 border-b border-border bg-surface-muted/40 px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-accent">
              <ScrollText className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Add log</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Record debug notes, incidents, or things to follow up on. Visible to dev role only.
              </p>
            </div>
          </div>
          <form onSubmit={addLog} className="space-y-4 p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Level</span>
                <select className={selectClass} value={level} onChange={(e) => setLevel(e.target.value as DevLogLevel)}>
                  {DEV_LOG_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Source</span>
                <input
                  className={inputClass}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Optional (e.g. auth, referrals)"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Message</span>
              <textarea
                required
                rows={3}
                className={inputClass + " min-h-[5.5rem] resize-y"}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What happened or what should we remember?"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || !message.trim()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white transition hover:opacity-95 disabled:pointer-events-none disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Add log
              </button>
            </div>
          </form>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border bg-surface-muted/40 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Recent logs</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loadingList ? "" : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void clearLogs()}
              disabled={clearing || loadingList || rows.length === 0}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-surface-muted/80 disabled:pointer-events-none disabled:opacity-50"
            >
              {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
              Clear all
            </button>
          </div>

          {loadError ? (
            <p className="px-5 py-6 text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : loadingList ? (
            <div className="space-y-0 px-5 py-4" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4 border-b border-border/60 py-3 last:border-0">
                  <div className="h-4 w-28 animate-pulse rounded bg-muted-foreground/10" />
                  <div className="h-4 w-16 animate-pulse rounded bg-muted-foreground/10" />
                  <div className="h-4 flex-1 animate-pulse rounded bg-muted-foreground/15" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-foreground">No logs yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Add a note above when debugging or tracking issues.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/30">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      When
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Level
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Source
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Message
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Author
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/70 transition-colors hover:bg-surface-muted/25"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatWhen(row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
                            levelBadgeClass(row.level)
                          }
                        >
                          {row.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.source?.trim() || "—"}</td>
                      <td className="max-w-[min(28rem,40vw)] px-4 py-3">
                        <span className="block whitespace-pre-wrap break-words text-foreground">{row.message}</span>
                        {row.context && Object.keys(row.context).length > 0 ? (
                          <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-border bg-surface-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
                            {JSON.stringify(row.context, null, 2)}
                          </pre>
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
