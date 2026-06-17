"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MainShell } from "@/components/dashboard/main-shell";
import { useSession } from "@/components/auth/session-provider";
import type { DevLogEntry } from "@/lib/dev/logs";
import { canAccessDev } from "@/lib/auth/types";

type ActivityFilter = "all" | "login" | "kpi" | "admin";

type LogsResponse = {
  logs?: DevLogEntry[];
  error?: string;
  setupRequired?: boolean;
  setupSql?: string;
};

function isActivityEntry(row: DevLogEntry): boolean {
  const source = row.source?.trim();
  if (!source) return false;
  return source === "auth" || source.startsWith("kpi.") || source.startsWith("admin.");
}

function activityType(row: DevLogEntry): ActivityFilter {
  const source = row.source?.trim() ?? "";
  if (source === "auth") return "login";
  if (source.startsWith("kpi.")) return "kpi";
  return "admin";
}

function typeLabel(row: DevLogEntry): string {
  const source = row.source?.trim() ?? "";
  const msg = row.message.toLowerCase();
  if (source === "auth") {
    if (msg.includes("opened app")) return "App open";
    if (msg.includes("signed in")) return "Sign in";
    if (msg.includes("signed out")) return "Sign out";
    return "Login";
  }
  if (source === "kpi.weekly") return "Weekly KPI";
  if (source === "kpi.nmac") return "NMAC master";
  if (source === "admin.users") return "Users";
  if (source === "admin.access") return "Access";
  if (source.startsWith("kpi.")) return "KPI";
  if (source.startsWith("admin.")) return "Admin";
  return "Activity";
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "login", label: "Logins" },
  { id: "kpi", label: "Data entry" },
  { id: "admin", label: "Admin" },
];

export default function DevLogsPage() {
  const { user, loading } = useSession();
  const [rows, setRows] = useState<DevLogEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupSql, setSetupSql] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");

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
        setLoadError(j.error ?? "Activity logging is not set up yet.");
        setRows([]);
        return;
      }
      if (!r.ok) {
        setLoadError(j.error ?? "Could not load activity.");
        setRows([]);
        return;
      }
      setRows((j.logs ?? []).filter(isActivityEntry));
    } catch {
      setLoadError("Could not load activity.");
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

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((row) => activityType(row) === filter);
  }, [rows, filter]);

  if (loading) {
    return (
      <MainShell title="Activity" subtitle="Loading">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </MainShell>
    );
  }

  if (!canAccessDev(user?.role)) {
    return (
      <MainShell title="Activity" subtitle="Restricted">
        <p className="text-sm text-muted-foreground">You need the Dev role to view activity.</p>
      </MainShell>
    );
  }

  return (
    <MainShell title="Activity" subtitle="Logins, KPI saves, and admin changes">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        {setupRequired ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 sm:px-5">
            <p className="text-sm font-medium text-foreground">Run this once in Supabase SQL Editor</p>
            <p className="mt-1 text-sm text-muted-foreground">
              After the table exists, logins and saves will show up here automatically.
            </p>
            {setupSql ? (
              <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-border bg-background/80 p-3 text-[11px] leading-relaxed text-foreground">
                {setupSql}
              </pre>
            ) : null}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-muted/40 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent " +
                    (filter === f.id
                      ? "border-accent bg-accent-muted/50 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-surface-muted/80 hover:text-foreground")
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
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
          </div>

          {loadError && !setupRequired ? (
            <p className="px-5 py-6 text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : loadingList ? (
            <div className="space-y-0 px-5 py-4" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4 border-b border-border/60 py-3 last:border-0">
                  <div className="h-4 w-28 animate-pulse rounded bg-muted-foreground/10" />
                  <div className="h-4 w-20 animate-pulse rounded bg-muted-foreground/10" />
                  <div className="h-4 flex-1 animate-pulse rounded bg-muted-foreground/15" />
                  <div className="h-4 w-36 animate-pulse rounded bg-muted-foreground/10" />
                </div>
              ))}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="text-sm font-medium text-foreground">
                {setupRequired ? "Set up logging first" : "No activity yet"}
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                {setupRequired
                  ? "Run the SQL above, then sign in or save KPI data."
                  : "Sign in, enter KPI numbers, or change users — those events appear here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/30">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      When
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Type
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      What happened
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Who
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/70 transition-colors hover:bg-surface-muted/25"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatWhen(row.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-foreground">
                        {typeLabel(row)}
                      </td>
                      <td className="max-w-[min(36rem,50vw)] px-4 py-3 text-foreground">{row.message}</td>
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
