"use client";

import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MainShell } from "@/components/dashboard/main-shell";
import { useSession } from "@/components/auth/session-provider";
import { getActivityDetails, hasActivityDetails } from "@/lib/dev/activity-details";
import type { DevLogEntry } from "@/lib/dev/logs";
import { canAccessDev } from "@/lib/auth/types";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";

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
  const { customRoles } = useDashboardPreferences();
  const [rows, setRows] = useState<DevLogEntry[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupSql, setSetupSql] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const loadedRef = useRef(false);

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setInitialLoading(true);
    setLoadError(null);
    if (!silent) setSetupRequired(false);
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
        if (!silent) setRows([]);
        return;
      }
      setSetupRequired(false);
      setRows((j.logs ?? []).filter(isActivityEntry));
    } catch {
      setLoadError("Could not load activity.");
      if (!silent) setRows([]);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !canAccessDev(user?.role) || loadedRef.current) return;
    loadedRef.current = true;
    void refresh(false);
  }, [loading, user?.role, refresh]);

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
        <p className="text-sm text-muted-foreground">You need the Developer role to view activity.</p>
      </MainShell>
    );
  }

  return (
    <MainShell title="Activity" subtitle="Logins, KPI saves, and admin changes — click a row for details">
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
              onClick={() => void refresh(true)}
              disabled={refreshing || initialLoading}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-surface-muted/80 disabled:pointer-events-none disabled:opacity-50"
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              )}
              Refresh
            </button>
          </div>

          {loadError && !setupRequired ? (
            <p className="px-5 py-6 text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : initialLoading ? (
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
                  {filteredRows.map((row) => {
                    const details = getActivityDetails(row, customRoles);
                    const expandable = hasActivityDetails(row, customRoles);
                    const expanded = expandedId === row.id;

                    return (
                      <Fragment key={row.id}>
                        <tr
                          className={
                            "border-b border-border/70 transition-colors " +
                            (expandable
                              ? "cursor-pointer hover:bg-surface-muted/25"
                              : "hover:bg-surface-muted/25")
                          }
                          onClick={() => {
                            if (!expandable) return;
                            setExpandedId(expanded ? null : row.id);
                          }}
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              {expandable ? (
                                expanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                )
                              ) : (
                                <span className="inline-block w-3.5 shrink-0" aria-hidden />
                              )}
                              {formatWhen(row.created_at)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-foreground">
                            {typeLabel(row)}
                          </td>
                          <td className="max-w-[min(36rem,50vw)] px-4 py-3 text-foreground">{row.message}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {row.created_by_email ?? "—"}
                          </td>
                        </tr>
                        {expanded && details.length > 0 ? (
                          <tr key={`${row.id}-details`} className="border-b border-border/70 bg-surface-muted/20">
                            <td colSpan={4} className="px-4 py-3 sm:px-8">
                              <div className="rounded-lg border border-border/80 bg-background/60 px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Details
                                </p>
                                <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                                  {details.map((item) => (
                                    <div
                                      key={`${row.id}-${item.label}`}
                                      className={item.lines?.length ? "min-w-0 sm:col-span-2" : "min-w-0"}
                                    >
                                      <dt className="text-xs text-muted-foreground">{item.label}</dt>
                                      {item.lines?.length ? (
                                        <dd className="mt-1">
                                          <ul className="space-y-1 text-sm text-foreground">
                                            {item.lines.map((line) => (
                                              <li key={`${row.id}-${item.label}-${line}`} className="leading-snug">
                                                {line}
                                              </li>
                                            ))}
                                          </ul>
                                          {item.truncated ? (
                                            <p className="mt-1 text-xs text-muted-foreground">
                                              …and {item.truncated} more
                                            </p>
                                          ) : null}
                                        </dd>
                                      ) : (
                                        <dd className="mt-0.5 text-sm text-foreground">{item.value}</dd>
                                      )}
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </MainShell>
  );
}
