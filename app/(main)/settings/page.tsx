"use client";

import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Loader2,
  PanelLeftClose,
  Smartphone,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MainShell } from "@/components/dashboard/main-shell";
import { useSession } from "@/components/auth/session-provider";
import { formatDisplayName } from "@/lib/auth/display-name";
import {
  clearNmacMonthlyLocalCache,
  DASHBOARD_PREFS_EVENT,
  loadHideLegacyNav,
  loadUseNmacTestData,
  saveHideLegacyNav,
  saveUseNmacTestData,
} from "@/lib/dashboard-preferences";

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = parts[0]!.charAt(0).toUpperCase();
  const b = parts.length > 1 ? parts[parts.length - 1]!.charAt(0).toUpperCase() : "";
  return (a + b).slice(0, 2);
}

type SwitchRowProps = {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  icon: ReactNode;
};

function SwitchRow({ title, description, checked, onCheckedChange, icon }: SwitchRowProps) {
  return (
    <div className="flex gap-3 py-4 sm:gap-4">
      <div
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted/60 text-muted-foreground"
        aria-hidden
      >
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4 sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={`${title}: ${checked ? "on" : "off"}`}
          onClick={() => onCheckedChange(!checked)}
          className={
            "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
            (checked ? "bg-accent" : "bg-muted-foreground/30")
          }
        >
          <span
            className={
              "pointer-events-none absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200 ease-out " +
              (checked ? "left-[calc(100%-1.625rem)]" : "left-0.5")
            }
            aria-hidden
          />
        </button>
      </div>
    </div>
  );
}

type Feedback = { tone: "ok" | "err"; text: string } | null;

export default function SettingsPage() {
  const { user, loading, logout, refresh } = useSession();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [hideLegacyNav, setHideLegacyNav] = useState(false);
  const [useNmacTestData, setUseNmacTestData] = useState(true);
  const [prefsNote, setPrefsNote] = useState<string | null>(null);
  const [cacheClearOpen, setCacheClearOpen] = useState(false);

  const displayName = formatDisplayName(user);
  const avatarLetter = initialsFromDisplayName(displayName);

  const nameDirty = useMemo(() => {
    if (!user) return false;
    const a = (user.firstName ?? "").trim();
    const b = (user.lastName ?? "").trim();
    return first.trim() !== a || last.trim() !== b;
  }, [user, first, last]);

  useEffect(() => {
    if (user) {
      setFirst(user.firstName ?? "");
      setLast(user.lastName ?? "");
    }
  }, [user]);

  useEffect(() => {
    setHideLegacyNav(loadHideLegacyNav());
    setUseNmacTestData(loadUseNmacTestData());
    const sync = () => {
      setHideLegacyNav(loadHideLegacyNav());
      setUseNmacTestData(loadUseNmacTestData());
    };
    window.addEventListener(DASHBOARD_PREFS_EVENT, sync);
    return () => window.removeEventListener(DASHBOARD_PREFS_EVENT, sync);
  }, []);

  const saveProfile = useCallback(async () => {
    setFeedback(null);
    setSaving(true);
    try {
      const r = await fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: first, last_name: last }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setFeedback({ tone: "err", text: j.error ?? "Could not save." });
        return;
      }
      setFeedback({ tone: "ok", text: "Name saved." });
      await refresh();
    } catch {
      setFeedback({ tone: "err", text: "Could not save." });
    } finally {
      setSaving(false);
    }
  }, [first, last, refresh]);

  return (
    <MainShell title="Settings" subtitle="Preferences and account">
      <div className="mx-auto grid max-w-3xl gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
          <div className="flex items-start gap-3 border-b border-border bg-surface-muted/40 px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-accent">
              <Smartphone className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 className="text-base font-semibold tracking-tight text-foreground">This device</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Preferences stay in this browser. They do not sync to other devices or users.
              </p>
            </div>
          </div>
          <div className="divide-y divide-border px-5">
            <SwitchRow
              icon={<PanelLeftClose className="h-4 w-4" strokeWidth={2} />}
              title="Hide legacy navigation"
              description="Hides Practice (weekly KPIs, doctors) and Data entry in the sidebar. You can still open those pages by URL."
              checked={hideLegacyNav}
              onCheckedChange={(next) => {
                setHideLegacyNav(next);
                saveHideLegacyNav(next);
              }}
            />
            <SwitchRow
              icon={<Sparkles className="h-4 w-4" strokeWidth={2} />}
              title="Sample data for NMAC charts"
              description="When on and months are empty, fills them with sample values for preview. Turning off removes those stored month values from this browser and reloads saved data from your organization when available."
              checked={useNmacTestData}
              onCheckedChange={(next) => {
                setUseNmacTestData(next);
                saveUseNmacTestData(next);
              }}
            />
          </div>
          <div className="border-t border-border bg-surface-muted/25 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Trash2 className="h-4 w-4 text-muted-foreground" strokeWidth={2} aria-hidden />
              Reset chart month cache
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Removes the FY month values stored in this browser for NMAC charts. They load again after refresh when
              your data is available. If sample data is on and nothing is saved, samples may reappear.
            </p>
            {!cacheClearOpen ? (
              <button
                type="button"
                onClick={() => setCacheClearOpen(true)}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground transition hover:border-destructive/45 hover:bg-destructive/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
              >
                <Trash2 className="h-4 w-4 opacity-80" aria-hidden />
                Clear cache…
              </button>
            ) : (
              <div className="mt-3 flex flex-col gap-2 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">Only affects this browser. Continue?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCacheClearOpen(false)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-surface-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearNmacMonthlyLocalCache();
                      setPrefsNote("Local month cache cleared.");
                      setCacheClearOpen(false);
                      window.setTimeout(() => setPrefsNote(null), 5000);
                    }}
                    className="rounded-lg bg-destructive px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:opacity-95"
                  >
                    Clear now
                  </button>
                </div>
              </div>
            )}
            {prefsNote ? (
              <p
                className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                role="status"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {prefsNote}
              </p>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-black/5 dark:ring-white/[0.04]">
          <div className="flex items-start gap-3 border-b border-border bg-surface-muted/40 px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-accent">
              <UserRound className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Account</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                How you appear in the app and your role in this workspace.
              </p>
            </div>
          </div>
          <div className="px-5 py-5">
            {loading ? (
              <div className="space-y-4" aria-busy="true" aria-label="Loading account">
                <div className="flex gap-3">
                  <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-muted-foreground/15" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 w-40 animate-pulse rounded bg-muted-foreground/15" />
                    <div className="h-3 w-56 max-w-full animate-pulse rounded bg-muted-foreground/10" />
                  </div>
                </div>
                <div className="h-10 animate-pulse rounded-lg bg-muted-foreground/10" />
                <div className="h-10 animate-pulse rounded-lg bg-muted-foreground/10" />
              </div>
            ) : (
              <>
                <div className="flex gap-3 rounded-xl border border-border bg-gradient-to-br from-surface-muted/80 to-surface-muted/30 p-4">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold text-accent"
                    aria-hidden
                  >
                    {avatarLetter}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                    <p className="mt-2">
                      <span className="sr-only">Your role: </span>
                      <span className="inline-flex rounded-md border border-border bg-background/80 px-2 py-0.5 text-xs font-medium capitalize text-foreground">
                        {user?.role}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Display name</p>
                      <p className="mt-0.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
                        Shown in the sidebar when both fields are filled; otherwise your email is used.
                      </p>
                    </div>
                    {nameDirty ? (
                      <span className="shrink-0 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Unsaved
                      </span>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">First name</span>
                      <input
                        className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition placeholder:text-muted-foreground/60 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
                        value={first}
                        onChange={(e) => setFirst(e.target.value)}
                        autoComplete="given-name"
                        placeholder="First name"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Last name</span>
                      <input
                        className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground transition placeholder:text-muted-foreground/60 focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
                        value={last}
                        onChange={(e) => setLast(e.target.value)}
                        autoComplete="family-name"
                        placeholder="Last name"
                      />
                    </label>
                  </div>
                  {feedback ? (
                    <div
                      role="status"
                      className={
                        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm " +
                        (feedback.tone === "ok"
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                          : "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-200")
                      }
                    >
                      {feedback.tone === "ok" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      )}
                      {feedback.text}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void saveProfile()}
                    disabled={saving || !nameDirty}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-95 disabled:pointer-events-none disabled:opacity-40"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {saving ? "Saving…" : "Save name"}
                  </button>
                </div>

                <details className="group mt-6 rounded-lg border border-border bg-surface-muted/25 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-medium text-muted-foreground transition hover:text-foreground">
                    <span className="flex items-center gap-2">
                      <BarChart3 className="h-3.5 w-3.5 opacity-70" aria-hidden />
                      What Viewer, Editor, and Admin can do
                    </span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <ul className="space-y-2 border-t border-border px-4 pb-3 pt-2 text-xs leading-relaxed text-muted-foreground">
                    <li>
                      <span className="font-medium text-foreground">Viewer</span> — dashboards and reports,
                      read-only.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Editor</span> — can enter weekly KPI data.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Admin</span> — editor access plus user management.
                    </li>
                  </ul>
                </details>

                <button
                  type="button"
                  onClick={() => void logout()}
                  className="mt-5 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent-muted/35 sm:w-auto"
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </MainShell>
  );
}
