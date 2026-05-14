"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { DashboardKpiInfo } from "@/components/dashboard/dashboard-kpi-info";
import { KpiDataTable } from "@/components/dashboard/kpi-data-table";
import { KpiFilters } from "@/components/dashboard/kpi-filters";
import {
  isTargetRateAppropriate,
  isVsLastYearRateAppropriate,
  type RateColumnMode,
} from "@/lib/kpi/rate";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import {
  formatKpiValue,
  loadKpiDefinitions,
  loadWeeklyRows,
} from "@/lib/kpi/data-source";
import type { KpiDefinition, WeeklyRow } from "@/lib/kpi/types";

const KpiChart = dynamic(
  () => import("@/components/dashboard/kpi-chart").then((m) => m.KpiChart),
  {
    ssr: false,
    loading: () => (
      <div className="dashboard-card h-[340px] animate-pulse bg-surface-muted/30" aria-hidden />
    ),
  },
);

function applyClientFilters(rows: WeeklyRow[], preset: string, search: string) {
  let next = rows;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    next = next.filter((r) => r.weekLabel.toLowerCase().includes(q));
  }
  if (preset === "4") next = next.slice(-4);
  if (preset === "8") next = next.slice(-8);
  return next;
}

function latestVsTarget(kpi: KpiDefinition, rows: WeeklyRow[]) {
  const last = [...rows].reverse().find((r) => r.thisYear !== null);
  const val = last?.thisYear ?? null;
  if (val === null) return { delta: null as string | null };
  const diff = val - kpi.target;
  const suffix = kpi.suffix || (kpi.unit === "percent" ? "%" : "");
  return { delta: `${diff > 0 ? "+" : ""}${formatKpiValue(diff, kpi.unit)}${suffix} vs target` };
}

export function DashboardClient() {
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);
  const [slug, setSlug] = useState("");
  const [year, setYear] = useState(2026);
  const [weekPreset, setWeekPreset] = useState("all");
  const [rateColumn, setRateColumn] = useState<RateColumnMode>("none");
  const [search, setSearch] = useState("");
  const [rawRows, setRawRows] = useState<WeeklyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  /** Whether live data loaded successfully (vs setup missing) */
  const [dataOnline, setDataOnline] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function init() {
      setLoading(true);
      const defs = await loadKpiDefinitions();
      if (!active) return;

      setKpis(defs.data);
      setSlug(defs.data[0]?.slug ?? "");
      setDataOnline(defs.fromSupabase && !defs.error);
      setNotice(defs.error ?? null);
      setLoading(false);
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!slug) return;
    let active = true;

    async function loadRows() {
      setLoadingRows(true);
      const result = await loadWeeklyRows(slug, year);
      if (!active) return;
      setRawRows(result.data);
      setDataOnline(result.fromSupabase && !result.error);
      if (result.error) setNotice(result.error);
      else setNotice(null);
      setLoadingRows(false);
    }

    loadRows();
    return () => {
      active = false;
    };
  }, [slug, year]);

  const kpi = useMemo(() => kpis.find((k) => k.slug === slug) ?? kpis[0], [kpis, slug]);
  const rows = useMemo(() => applyClientFilters(rawRows, weekPreset, search), [rawRows, weekPreset, search]);

  const allowTargetRate = isTargetRateAppropriate(kpi);
  const allowVsLastYear = useMemo(() => isVsLastYearRateAppropriate(rows), [rows]);

  const effectiveRateColumn = useMemo((): RateColumnMode => {
    if (rateColumn === "target_pct" && !allowTargetRate) return "none";
    if (rateColumn === "vs_last_year" && !allowVsLastYear) return "none";
    return rateColumn;
  }, [rateColumn, allowTargetRate, allowVsLastYear]);

  useEffect(() => {
    if (effectiveRateColumn !== rateColumn) {
      setRateColumn(effectiveRateColumn);
    }
  }, [effectiveRateColumn, rateColumn]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="dashboard-card h-36 animate-pulse bg-surface-muted/40" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="dashboard-card h-28 animate-pulse bg-surface-muted/40" />
          <div className="dashboard-card h-28 animate-pulse bg-surface-muted/40" />
        </div>
        <p className="text-sm text-muted-foreground">Loading KPIs…</p>
      </div>
    );
  }

  if (!kpi) {
    return (
      <div className="space-y-2">
        {notice ? (
          <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            {notice}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          No KPIs are set up yet. Ask your administrator to complete the one-time setup, then refresh this page.
        </p>
      </div>
    );
  }

  const suffix = kpi.suffix || (kpi.unit === "percent" ? "%" : "");
  const lastTy = [...rows].reverse().find((r) => r.thisYear !== null)?.thisYear ?? null;
  const lastLy = [...rows].reverse().find((r) => r.lastYear !== null)?.lastYear ?? null;
  const vt = latestVsTarget(kpi, rows);

  const cards = [
    {
      label: "Latest week (this year)",
      value: lastTy === null ? "—" : `${formatKpiValue(lastTy, kpi.unit)}${suffix}`,
      hint: vt.delta ?? undefined,
    },
    {
      label: "Same week last year",
      value: lastLy === null ? "—" : `${formatKpiValue(lastLy, kpi.unit)}${suffix}`,
      hint: `Reporting year ${year} · ${dataOnline ? "Live data" : "Not connected"}`,
    },
  ];

  const empty = rows.length === 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7">
      {notice ? (
        <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          {notice}
        </p>
      ) : null}
      <DashboardKpiInfo
        kpi={kpi}
        year={year}
        allWeeks={rawRows}
        filteredCount={rows.length}
      />
      <SummaryCards cards={cards} />
      <KpiFilters
        kpis={kpis}
        selectedSlug={slug}
        onKpiChange={setSlug}
        year={year}
        onYearChange={setYear}
        weekPreset={weekPreset}
        onWeekPresetChange={setWeekPreset}
        search={search}
        onSearchChange={setSearch}
        rateColumn={rateColumn}
        onRateColumnChange={setRateColumn}
        allowTargetRate={allowTargetRate}
        allowVsLastYear={allowVsLastYear}
      />
      {loadingRows ? <p className="text-sm text-muted-foreground">Loading weekly data…</p> : null}
      {!loadingRows && empty ? (
        <p className="rounded-xl border border-dashed border-border bg-card/80 py-16 text-center text-muted-foreground">
          No rows match your filters.
        </p>
      ) : null}
      {!loadingRows && !empty ? (
        <>
          <KpiChart kpi={kpi} rows={rows} />
          <KpiDataTable kpi={kpi} rows={rows} rateColumn={effectiveRateColumn} />
        </>
      ) : null}
    </div>
  );
}
