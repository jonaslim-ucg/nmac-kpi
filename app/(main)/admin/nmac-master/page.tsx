"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Loader2, RotateCcw, Table2, Target } from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { MainShell } from "@/components/dashboard/main-shell";
import { NmacMasterEntryPanel, type NmacMasterDb } from "@/components/kpi-nmac-2026/nmac-master-entry-panel";
import { NmacMasterSheetPanel } from "@/components/kpi-nmac-2026/nmac-master-sheet-panel";
import { NmacTargetsForm } from "@/components/kpi-nmac-2026/nmac-targets-form";
import { canEditKpiData } from "@/lib/auth/types";
import {
  buildKpisPerMonth,
  diffTargetsVsFy,
  emptyNmacMonthDbs,
  KPIs,
  loadTargetPack,
  mergeDefaultTargets,
  MONTHS,
  saveTargetOverrides,
  saveTargetPack,
} from "@/lib/kpi-nmac-2026/model";
import { DEFAULT_KPI_YEAR, SUPPORTED_KPI_YEARS } from "@/lib/kpi/years";
import { fetchNmacMasterMonthly, upsertNmacMasterMonth } from "@/lib/supabase/nmac-master-service";
import {
  deleteNmacTargetMonth,
  fetchNmacTargetMonths,
  fetchNmacTargets,
  upsertNmacTargetMonth,
  upsertNmacTargets,
} from "@/lib/supabase/nmac-targets-service";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Snackbar, type SnackbarVariant } from "@/components/ui/snackbar";

type Tab = "targets" | "monthly" | "sheet";
type TargetScope = "fy" | number;

export default function AdminNmacMasterPage() {
  const { user, loading: sessionLoading } = useSession();
  const [tab, setTab] = useState<Tab>("targets");
  const [year, setYear] = useState(DEFAULT_KPI_YEAR);
  const [db, setDb] = useState<NmacMasterDb>(() => emptyNmacMonthDbs());
  const [fyPartial, setFyPartial] = useState<Record<string, number>>({});
  const [monthPartials, setMonthPartials] = useState<Partial<Record<number, Record<string, number>>>>({});
  const [targetScope, setTargetScope] = useState<TargetScope>("fy");
  const [targetsFull, setTargetsFull] = useState<Record<string, number>>(() => mergeDefaultTargets({}));
  const [savedTargets, setSavedTargets] = useState<Record<string, number>>(() => mergeDefaultTargets({}));
  const [entryMonth, setEntryMonth] = useState(() => new Date().getMonth());
  const [loading, setLoading] = useState(true);
  const [savingMonth, setSavingMonth] = useState(false);
  const [savingTargets, setSavingTargets] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);
  const [snackbar, setSnackbar] = useState<{ text: string; variant: SnackbarVariant } | null>(null);

  const kpisForEntry = useMemo(
    () => buildKpisPerMonth(fyPartial, monthPartials)[entryMonth] ?? buildKpisPerMonth(fyPartial, monthPartials)[0]!,
    [fyPartial, monthPartials, entryMonth],
  );

  const targetsDirty = useMemo(
    () => KPIs.some((k) => targetsFull[k.id] !== savedTargets[k.id]),
    [targetsFull, savedTargets],
  );

  const sheetTargets = useMemo(() => mergeDefaultTargets(fyPartial), [fyPartial]);

  const showSnackbar = useCallback((text: string, variant: SnackbarVariant) => {
    setSnackbar({ text, variant });
  }, []);

  const applyScopeToForm = useCallback(
    (scope: TargetScope, fy: Record<string, number>, months: Partial<Record<number, Record<string, number>>>) => {
      if (scope === "fy") {
        const merged = mergeDefaultTargets(fy);
        setTargetsFull(merged);
        setSavedTargets(merged);
      } else {
        const merged = mergeDefaultTargets({ ...fy, ...months[scope] });
        setTargetsFull(merged);
        setSavedTargets(merged);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    async function pull() {
      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const [mRes, tRes, tmRes] = await Promise.all([
        fetchNmacMasterMonthly(year),
        fetchNmacTargets(year),
        fetchNmacTargetMonths(year),
      ]);
      if (!active) return;
      if (mRes.error) showSnackbar(mRes.error, "error");
      else setDb(mRes.data);
      if (tRes.error) showSnackbar(tRes.error, "error");
      if (tmRes.error) showSnackbar(tmRes.error, "error");

      const fy = tRes.error ? {} : tRes.data;
      const mo = tmRes.error ? {} : tmRes.data;
      if (!tRes.error) setFyPartial(fy);
      else setFyPartial({});
      if (!tmRes.error) setMonthPartials(mo);
      else setMonthPartials({});
      const prev = loadTargetPack(year);
      if (!tRes.error || !tmRes.error) {
        saveTargetPack({
          fy: !tRes.error ? fy : prev.fy,
          byMonth: !tmRes.error ? mo : prev.byMonth,
        }, year);
      }
      setTargetScope("fy");
      applyScopeToForm("fy", !tRes.error ? fy : {}, !tmRes.error ? mo : {});
      setLoading(false);
    }
    void pull();
    return () => {
      active = false;
    };
  }, [showSnackbar, applyScopeToForm, year]);

  const onPersist = useCallback(
    async (next: NmacMasterDb, month: number) => {
      if (!isSupabaseConfigured()) {
        showSnackbar(
          "Saving isn’t available: the data connection isn’t configured. Ask whoever manages this app to set the environment variables.",
          "error",
        );
        return false;
      }
      setSavingMonth(true);
      const { error } = await upsertNmacMasterMonth(year, month, next[month]);
      setSavingMonth(false);
      if (error) {
        showSnackbar(`Couldn’t save: ${error}`, "error");
        return false;
      }
      setDb(next);
      return true;
    },
    [showSnackbar, year],
  );

  const onPersistSheet = useCallback(
    async ({
      nextDb,
      dirtyMonths,
      nextTargets,
      targetsDirty: sheetTargetsDirty,
    }: {
      nextDb: NmacMasterDb;
      dirtyMonths: number[];
      nextTargets: Record<string, number>;
      targetsDirty: boolean;
    }) => {
      if (!isSupabaseConfigured()) {
        showSnackbar(
          "Saving isn’t available: the data connection isn’t configured. Ask whoever manages this app to set the environment variables.",
          "error",
        );
        return false;
      }

      setSavingSheet(true);
      try {
        if (sheetTargetsDirty) {
          const { error } = await upsertNmacTargets(year, nextTargets);
          if (error) {
            showSnackbar(`Couldn’t save targets: ${error}`, "error");
            return false;
          }
        }

        for (const month of dirtyMonths) {
          const { error } = await upsertNmacMasterMonth(year, month, nextDb[month]);
          if (error) {
            showSnackbar(`Couldn’t save ${MONTHS[month]}: ${error}`, "error");
            return false;
          }
        }

        if (sheetTargetsDirty) {
          setFyPartial({ ...nextTargets });
          saveTargetOverrides(nextTargets, year);
          if (targetScope === "fy") {
            setTargetsFull({ ...nextTargets });
            setSavedTargets({ ...nextTargets });
          }
        }
        if (dirtyMonths.length > 0) setDb(nextDb);
        showSnackbar("Spreadsheet changes saved to Supabase.", "success");
        return true;
      } finally {
        setSavingSheet(false);
      }
    },
    [showSnackbar, targetScope, year],
  );

  const saveTargets = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      showSnackbar(
        "Saving isn’t available: the data connection isn’t configured. Ask whoever manages this app to set the environment variables.",
        "error",
      );
      return;
    }
    setSavingTargets(true);
    if (targetScope === "fy") {
      const { error } = await upsertNmacTargets(year, targetsFull);
      setSavingTargets(false);
      if (error) {
        showSnackbar(`Couldn’t save targets: ${error}`, "error");
        return;
      }
      setFyPartial({ ...targetsFull });
      setSavedTargets({ ...targetsFull });
      saveTargetOverrides(targetsFull, year);
      showSnackbar("FY targets saved to Supabase.", "success");
      return;
    }

    const m = targetScope;
    const patch = diffTargetsVsFy(fyPartial, targetsFull);
    let nextMonths = { ...monthPartials };
    if (Object.keys(patch).length === 0) {
      const { error } = await deleteNmacTargetMonth(year, m);
      setSavingTargets(false);
      if (error) {
        showSnackbar(`Couldn’t clear month targets: ${error}`, "error");
        return;
      }
      delete nextMonths[m];
      setMonthPartials(nextMonths);
    } else {
      const { error } = await upsertNmacTargetMonth(year, m, patch);
      setSavingTargets(false);
      if (error) {
        showSnackbar(`Couldn’t save month targets: ${error}`, "error");
        return;
      }
      nextMonths = { ...nextMonths, [m]: patch };
      setMonthPartials(nextMonths);
    }
    setSavedTargets({ ...targetsFull });
    saveTargetPack({ fy: fyPartial, byMonth: nextMonths }, year);
    showSnackbar(`Targets for ${MONTHS[m]} saved.`, "success");
  }, [showSnackbar, targetsFull, targetScope, fyPartial, monthPartials, year]);

  const resetTargetsToDefaults = useCallback(() => {
    if (targetScope === "fy") {
      setTargetsFull(mergeDefaultTargets({}));
      return;
    }
    setTargetsFull(mergeDefaultTargets({ ...fyPartial }));
  }, [targetScope, fyPartial]);

  const onTargetScopeSelect = useCallback(
    (raw: string) => {
      if (raw === "fy") {
        setTargetScope("fy");
        applyScopeToForm("fy", fyPartial, monthPartials);
        return;
      }
      const m = Number(raw);
      if (!Number.isInteger(m) || m < 0 || m > 11) return;
      setTargetScope(m);
      applyScopeToForm(m, fyPartial, monthPartials);
    },
    [fyPartial, monthPartials, applyScopeToForm],
  );

  if (sessionLoading) {
    return (
      <MainShell title="NMAC master" subtitle="Loading">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </MainShell>
    );
  }

  if (!canEditKpiData(user?.role)) {
    return (
      <MainShell title="NMAC master" subtitle="Restricted">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-muted-foreground">
            You don’t have permission to edit data. Ask an administrator to assign you the <strong>Editor</strong> or{" "}
            <strong>Admin</strong> role.
          </p>
        </div>
      </MainShell>
    );
  }

  return (
    <MainShell
      title="NMAC master"
      subtitle={`FY ${year} · Targets and monthly this year / last year actuals sync to Supabase and the NMAC dashboard.`}
    >
      <Snackbar
        message={snackbar?.text ?? null}
        variant={snackbar?.variant ?? "success"}
        onDismiss={() => setSnackbar(null)}
      />

      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {tab !== "sheet" ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">NMAC master year</p>
              <p className="text-xs text-muted-foreground">Choose the dataset year before editing targets or monthly actuals.</p>
            </div>
            <label className="flex w-full flex-col gap-1 sm:w-40">
              <span className="text-xs font-medium text-muted-foreground">Year</span>
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground"
                value={String(year)}
                onChange={(e) => setYear(Number(e.target.value))}
                disabled={loading || savingMonth || savingTargets || savingSheet}
              >
                {SUPPORTED_KPI_YEARS.map((optionYear) => (
                  <option key={optionYear} value={optionYear}>
                    {optionYear}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {!isSupabaseConfigured() ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-4 text-sm text-foreground">
            <p className="font-medium text-amber-900 dark:text-amber-100">Supabase is not configured</p>
            <p className="mt-2 text-muted-foreground">
              Add <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,
              then run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">supabase/schema.sql</code> (or the
              add-on scripts under <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">supabase/</code>
              ).
            </p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card px-6 py-16 text-center shadow-sm">
            <Loader2 className="h-9 w-9 animate-spin text-accent" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">Loading NMAC data</p>
              <p className="mt-1 text-sm text-muted-foreground">Fetching targets and monthly rows from Supabase…</p>
            </div>
            <div className="flex w-full max-w-md flex-col gap-2">
              <div className="h-2 animate-pulse rounded-full bg-muted" />
              <div className="h-2 w-[85%] animate-pulse rounded-full bg-muted" />
              <div className="h-2 w-[65%] animate-pulse rounded-full bg-muted" />
            </div>
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="NMAC master sections"
              className="flex flex-wrap gap-2 rounded-xl border border-border bg-muted/40 p-1.5 shadow-inner"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "targets"}
                onClick={() => setTab("targets")}
                className={
                  "inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition sm:flex-initial sm:px-5 " +
                  (tab === "targets"
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground")
                }
              >
                <Target className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                Targets
                {targetsDirty ? (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                    Unsaved
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "monthly"}
                onClick={() => setTab("monthly")}
                className={
                  "inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition sm:flex-initial sm:px-5 " +
                  (tab === "monthly"
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground")
                }
              >
                <CalendarRange className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                Monthly actuals
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "sheet"}
                onClick={() => setTab("sheet")}
                className={
                  "inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition sm:flex-initial sm:px-5 " +
                  (tab === "sheet"
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground")
                }
              >
                <Table2 className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                Spreadsheet
              </button>
            </div>

            {tab === "targets" ? (
              <section className="flex max-h-[min(85vh,760px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-md">
                <header className="shrink-0 border-b border-border bg-card px-4 py-4 sm:px-6 sm:py-5">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">Targets for {year}</h2>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      FY row is the default for every month. Choose a month to override goals for that month only (charts
                      and data entry use the effective target per calendar month).
                    </p>
                    <label className="flex shrink-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:items-end">
                      <span>Applies to</span>
                      <select
                        value={targetScope === "fy" ? "fy" : String(targetScope)}
                        onChange={(e) => onTargetScopeSelect(e.target.value)}
                        disabled={savingTargets}
                        className="min-h-[40px] min-w-[180px] rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50"
                      >
                        <option value="fy">Full year (default)</option>
                        {MONTHS.map((name, i) => (
                          <option key={name} value={String(i)}>
                            {name} only
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                  <NmacTargetsForm
                    targets={targetsFull}
                    onChange={setTargetsFull}
                    disabled={savingTargets}
                    baselineTargets={targetScope === "fy" ? undefined : mergeDefaultTargets(fyPartial)}
                    baselineLabel={targetScope === "fy" ? undefined : "FY target"}
                  />
                </div>

                <footer className="shrink-0 border-t border-border bg-muted/30 px-4 py-4 backdrop-blur-sm sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      {targetsDirty ? (
                        <span className="font-medium text-amber-800 dark:text-amber-200">
                          You have unsaved target changes.
                        </span>
                      ) : (
                        <span>All targets match the last saved version for this scope.</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <button
                        type="button"
                        onClick={resetTargetsToDefaults}
                        disabled={savingTargets}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-accent-muted/40 disabled:opacity-50"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden />
                        {targetScope === "fy" ? "Reset to app defaults" : "Reset to FY targets"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveTargets()}
                        disabled={savingTargets || !targetsDirty}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:pointer-events-none disabled:opacity-45"
                      >
                        {savingTargets ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            Saving…
                          </>
                        ) : targetScope === "fy" ? (
                          "Save FY targets"
                        ) : (
                          `Save ${MONTHS[targetScope]} overrides`
                        )}
                      </button>
                    </div>
                  </div>
                </footer>
              </section>
            ) : tab === "monthly" ? (
              <section className="overflow-hidden rounded-2xl border border-border shadow-md ring-1 ring-border/60">
                <div className="border-b border-border bg-muted/40 px-4 py-3 sm:px-5">
                  <h2 className="text-sm font-semibold text-foreground">Monthly this year / last year</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Pick a month, fill both columns where you have data, then use <strong>Save month</strong> for that
                    month only.
                  </p>
                </div>
                <div className="nk26-root nk26-shell p-4 sm:p-6">
                  <NmacMasterEntryPanel
                    db={db}
                    kpis={kpisForEntry}
                    onSelectedMonthChange={setEntryMonth}
                    onPersist={onPersist}
                    inputIdPrefix="admin-nmac-inp-"
                    saving={savingMonth}
                    hero={
                      <div className="nk26-entry-hero">
                        <div className="nk26-section-title">Data entry</div>
                        <p className="nk26-section-sub">
                          Green vs red on &quot;This year&quot; uses the goal for the month selected in the tabs below
                          (FY targets plus any overrides for that month from the Targets tab).
                        </p>
                      </div>
                    }
                  />
                </div>
              </section>
            ) : (
              <section className="overflow-hidden rounded-2xl border border-border shadow-md ring-1 ring-border/60">
                <div className="border-b border-border bg-muted/40 px-4 py-3 sm:px-5">
                  <h2 className="text-sm font-semibold text-foreground">Spreadsheet editor</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Edit targets and month values in one grid. Switch between this-year and last-year values before saving.
                  </p>
                </div>
                <div className="nk26-root nk26-shell p-4 sm:p-6">
                  <NmacMasterSheetPanel
                    db={db}
                    targets={sheetTargets}
                    year={year}
                    supportedYears={SUPPORTED_KPI_YEARS}
                    onYearChange={setYear}
                    onSave={onPersistSheet}
                    saving={savingSheet}
                  />
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </MainShell>
  );
}
