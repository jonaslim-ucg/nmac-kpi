"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { MainShell } from "@/components/dashboard/main-shell";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";
import { canEditKpiData } from "@/lib/auth/types";
import {
  formatKpiValue,
  loadKpiDefinitions,
  loadWeeklyRows,
} from "@/lib/kpi/data-source";
import type { KpiDefinition, WeeklyRow } from "@/lib/kpi/types";
import { DEFAULT_KPI_YEAR, SUPPORTED_KPI_YEARS } from "@/lib/kpi/years";
import { formatWeekLabel } from "@/lib/kpi/week-label";
import { upsertWeeklyRows } from "@/lib/supabase/kpi-service";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Snackbar, type SnackbarVariant } from "@/components/ui/snackbar";

function nextWeekIndex(rows: WeeklyRow[]): number {
  if (rows.length === 0) return 1;
  return Math.max(...rows.map((r) => r.weekIndex)) + 1;
}

export default function AdminPage() {
  const { user, loading: sessionLoading } = useSession();
  const { customRoles } = useDashboardPreferences();
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);
  const [slug, setSlug] = useState("");
  const [year, setYear] = useState(DEFAULT_KPI_YEAR);
  const [rows, setRows] = useState<WeeklyRow[]>([]);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Shown only on the empty setup screen (no KPIs) */
  const [setupError, setSetupError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ text: string; variant: SnackbarVariant } | null>(null);

  const showSnackbar = useCallback((text: string, variant: SnackbarVariant) => {
    setSnackbar({ text, variant });
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      setKpiLoading(true);
      const defs = await loadKpiDefinitions();
      if (!active) return;
      setKpis(defs.data);
      const firstSlug = defs.data[0]?.slug ?? "";
      setSlug(firstSlug);
      if (defs.data.length === 0) {
        setSetupError(defs.error ?? null);
      } else {
        setSetupError(null);
      }
      setKpiLoading(false);
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    async function pull() {
      setSnackbar(null);
      const result = await loadWeeklyRows(slug, year);
      if (!active) return;
      setRows(result.data);
      if (result.error) showSnackbar(result.error, "error");
    }
    pull();
    return () => {
      active = false;
    };
  }, [slug, year, showSnackbar]);

  const kpi = useMemo(() => kpis.find((k) => k.slug === slug) ?? kpis[0], [kpis, slug]);

  function handleAddWeek() {
    const n = nextWeekIndex(rows);
    setRows((prev) =>
      [...prev, { weekLabel: formatWeekLabel(n), weekIndex: n, thisYear: null, lastYear: null }].sort(
        (a, b) => a.weekIndex - b.weekIndex,
      ),
    );
    setSnackbar(null);
  }

  if (sessionLoading) {
    return (
      <MainShell title="Data entry" subtitle="Loading">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </MainShell>
    );
  }

  if (!canEditKpiData(user?.role, customRoles)) {
    return (
      <MainShell title="Data entry" subtitle="Restricted">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            You don’t have permission to edit data. Ask an administrator to assign you the <strong>Editor</strong> or{" "}
            <strong>Admin</strong> role.
          </p>
        </div>
      </MainShell>
    );
  }

  if (kpiLoading) {
    return (
      <MainShell title="Data entry" subtitle="Loading KPI setup">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </MainShell>
    );
  }

  if (!kpi) {
    return (
      <MainShell title="Data entry" subtitle="Setup required">
        <p className="max-w-lg text-sm text-muted-foreground">
          {setupError ??
            "No KPIs are available yet. Your technical contact needs to complete the one-time database setup, then try again."}
        </p>
      </MainShell>
    );
  }

  const suffix = kpi.suffix || (kpi.unit === "percent" ? "%" : "");

  async function handleSave() {
    setSaving(true);

    if (!isSupabaseConfigured()) {
      showSnackbar(
        "Saving isn’t available: the data connection isn’t configured. Ask whoever manages this app to set the environment variables.",
        "error",
      );
      setSaving(false);
      return;
    }

    const result = await upsertWeeklyRows(slug, year, rows);
    if (result.error) {
      showSnackbar(`Couldn’t save: ${result.error}`, "error");
    } else {
      showSnackbar("Your changes were saved.", "success");
    }
    setSaving(false);
  }

  return (
    <MainShell title="Data entry" subtitle="Enter numbers by week, then save">
      <Snackbar
        message={snackbar?.text ?? null}
        variant={snackbar?.variant ?? "success"}
        onDismiss={() => setSnackbar(null)}
      />
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[260px] flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">KPI</span>
            <select
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            >
              {kpis.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-32 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Year</span>
            <select
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {SUPPORTED_KPI_YEARS.map((optionYear) => (
                <option key={optionYear} value={optionYear}>
                  {optionYear}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleAddWeek}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent-muted/40"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add week
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Use <strong>Add week</strong> to add another row for this KPI and year. Leave a cell blank if you don’t have a
          number yet. Click <strong>Save changes</strong> to store everything online.
        </p>

        <div className="overflow-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-accent-muted/40">
                <th className="px-3 py-2 font-medium text-muted-foreground">Week</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">This year</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Last year</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.weekIndex}-${i}`} className="border-b border-border/80">
                  <td className="px-3 py-2 font-medium">{r.weekLabel}</td>
                  <td className="px-3 py-2">
                    <input
                      className="w-24 rounded border border-border bg-background px-2 py-1"
                      value={r.thisYear === null ? "" : String(r.thisYear)}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const num = v === "" ? null : Number(v);
                        setRows((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], thisYear: v === "" || Number.isNaN(num) ? null : num };
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-24 rounded border border-border bg-background px-2 py-1"
                      value={r.lastYear === null ? "" : String(r.lastYear)}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const num = v === "" ? null : Number(v);
                        setRows((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], lastYear: v === "" || Number.isNaN(num) ? null : num };
                          return next;
                        });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No weeks loaded for this year. Click <strong>Add week</strong> to start, or pick another year.
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Target for this KPI: {formatKpiValue(kpi.target, kpi.unit)}
          {suffix}
        </p>
      </div>
    </MainShell>
  );
}
