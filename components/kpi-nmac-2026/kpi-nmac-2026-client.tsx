"use client";

import { useAppTheme, type AppThemeName } from "@/components/app-theme-provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chart, ChartConfiguration } from "chart.js";
import "./nk26.css";
import {
  barBase,
  findKpi,
  lineBase,
  nk26ThisYearLineStyle,
  revenueChartConfig,
  rnVisitsBarConfig,
  emphasizeSelectedMonthBarColors,
  trendDatasets,
  utilNoshowConfig,
} from "@/lib/kpi-nmac-2026/chart-config";
import {
  buildKpisPerMonth,
  colorBar,
  emptyNmacMonthDbs,
  formatVal,
  getLastYearVal,
  getVal,
  KPIs,
  loadData,
  loadTargetPack,
  monthDbHasValues,
  MONTHS,
  NMAC_MASTER_DATA_YEAR,
  OVERVIEW_PRIORITY_KPIS,
  pct,
  saveAll,
  saveTargetPack,
  seedDemoIfEmpty,
  statusColor,
  type KpiRow,
  type MonthDb,
} from "@/lib/kpi-nmac-2026/model";
import { rateVsLastYearPct } from "@/lib/kpi/rate";
import { isNk26View, type Nk26View } from "@/lib/kpi-nmac-2026/views-meta";
import {
  DASHBOARD_PREFS_EVENT,
  loadUseNmacTestData,
  type DashboardPrefsDetail,
} from "@/lib/dashboard-preferences";
import { fetchNmacMasterMonthly } from "@/lib/supabase/nmac-master-service";
import { fetchNmacTargetMonths, fetchNmacTargets } from "@/lib/supabase/nmac-targets-service";
import { MonthTabs } from "./nmac-master-entry-panel";

let chartJsModule: Promise<typeof import("chart.js/auto")> | null = null;
function loadChartJs() {
  chartJsModule ??= import("chart.js/auto");
  return chartJsModule;
}

type Db = Record<number, MonthDb>;

function readBrowserNmacDb(): Db {
  if (typeof window === "undefined") return emptyNmacMonthDbs();
  try {
    const raw = loadData();
    return loadUseNmacTestData() ? seedDemoIfEmpty(raw) : raw;
  } catch {
    return emptyNmacMonthDbs();
  }
}

function stableDbEqual(a: Db, b: Db): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Matches `ThemeInitScript` on <html> so chart deps don’t flip undefined → light/dark (double mount). */
function readDocThemeClass(): AppThemeName {
  if (typeof document === "undefined") return "dark";
  if (document.documentElement.classList.contains("light")) return "light";
  return "dark";
}

type Props = { view: string };

/** KPI ids shown in the month stat row (below month tabs) per section view. */
const VIEW_MONTH_STATS: Partial<Record<Nk26View, string[]>> = {
  scheduling: ["util", "noshow", "leads", "ph"],
  finance: ["revenue", "copay", "leakage", "shop"],
  calls: ["callrate", "callvol"],
  nursing: ["ecg", "spiro", "nursing_ann"],
  specialty: ["trich", "ht", "fp", "wl"],
  compliance: ["satisfaction", "feedback", "survey", "engage", "sop"],
};

export function KpiNmac2026Client({ view }: Props) {
  const v: Nk26View = isNk26View(view) ? view : "overview";
  const { resolvedTheme } = useAppTheme();
  const chartThemeKey = useMemo<AppThemeName>(() => {
    if (resolvedTheme === "light" || resolvedTheme === "dark") return resolvedTheme;
    return readDocThemeClass();
  }, [resolvedTheme]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [db, setDb] = useState<Db>(() => readBrowserNmacDb());
  const initialPack = loadTargetPack();
  const [fyTargets, setFyTargets] = useState<Record<string, number>>(() => initialPack.fy);
  const [targetsByMonth, setTargetsByMonth] = useState<Partial<Record<number, Record<string, number>>>>(() => initialPack.byMonth);
  const chartsRef = useRef<Chart[]>([]);
  const pullGen = useRef(0);
  const chartFxGen = useRef(0);

  const kpisPerMonth = useMemo(() => buildKpisPerMonth(fyTargets, targetsByMonth), [fyTargets, targetsByMonth]);

  const kpisForSelected: readonly KpiRow[] = kpisPerMonth[selectedMonth] ?? kpisPerMonth[0]!;

  const monthLabel = useMemo(
    () => `Showing: ${MONTHS[selectedMonth]} 2026 data — click a month tab to switch`,
    [selectedMonth],
  );

  const hydrateLocalDb = useCallback(() => {
    const raw = loadData();
    setDb(loadUseNmacTestData() ? seedDemoIfEmpty(raw) : raw);
  }, []);

  const pullNmacFromServer = useCallback(async () => {
    const myGen = ++pullGen.current;
    const [mRes, tRes, tmRes] = await Promise.all([
      fetchNmacMasterMonthly(NMAC_MASTER_DATA_YEAR),
      fetchNmacTargets(NMAC_MASTER_DATA_YEAR),
      fetchNmacTargetMonths(NMAC_MASTER_DATA_YEAR),
    ]);
    if (myGen !== pullGen.current) return;
    if (!mRes.error) {
      const hasRemote = Object.values(mRes.data).some(monthDbHasValues);
      if (hasRemote) {
        setDb((prev) => {
          if (stableDbEqual(prev, mRes.data)) return prev;
          saveAll(mRes.data);
          return mRes.data;
        });
      }
    }
    if (myGen !== pullGen.current) return;
    const prev = loadTargetPack();
    let nextFy = prev.fy;
    let nextMo = prev.byMonth;
    if (!tRes.error) {
      nextFy = tRes.data;
      setFyTargets(tRes.data);
    }
    if (!tmRes.error) {
      nextMo = tmRes.data;
      setTargetsByMonth(tmRes.data);
    }
    if (!tRes.error || !tmRes.error) {
      saveTargetPack({ fy: nextFy, byMonth: nextMo });
    }
  }, []);

  useEffect(() => {
    const onPrefs = (ev: Event) => {
      hydrateLocalDb();
      const detail = (ev as CustomEvent<DashboardPrefsDetail>).detail;
      if (detail?.reloadNmacFromServer) void pullNmacFromServer();
    };
    window.addEventListener(DASHBOARD_PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(DASHBOARD_PREFS_EVENT, onPrefs);
  }, [hydrateLocalDb, pullNmacFromServer]);

  useEffect(() => {
    void pullNmacFromServer();
    return () => {
      pullGen.current += 1;
    };
  }, [pullNmacFromServer]);

  useEffect(() => {
    const gen = ++chartFxGen.current;
    chartsRef.current.forEach((c) => c.destroy());
    chartsRef.current = [];

    loadChartJs().then(({ default: ChartCtor }) => {
      if (gen !== chartFxGen.current) return;
      requestAnimationFrame(() => {
        if (gen !== chartFxGen.current) return;
      const mount = (id: string, cfg: ChartConfiguration) => {
        const canvas = document.getElementById(id) as HTMLCanvasElement | null;
        if (!canvas) return;
        chartsRef.current.push(new ChartCtor(canvas, cfg));
      };

      const highlight = selectedMonth;

      const simpleBar = (id: string, kpiId: string) => {
        const row0 = findKpi(kpiId, kpisPerMonth[0] ?? KPIs);
        const targetsArr = MONTHS.map((_, i) => findKpi(kpiId, kpisPerMonth[i] ?? KPIs).target);
        const barColors = colorBar(db, kpiId, targetsArr, row0.higher);
        mount(
          id,
          barBase(
            MONTHS,
            [
              {
                label: row0.label,
                data: MONTHS.map((_, i) => getVal(db, i, kpiId)),
                backgroundColor: emphasizeSelectedMonthBarColors(barColors, highlight),
              },
            ],
            targetsArr,
            undefined,
            highlight,
          ),
        );
      };

      const simpleLine = (id: string, kpiId: string) => {
        const row0 = findKpi(kpiId, kpisPerMonth[0] ?? KPIs);
        const targetsArr = MONTHS.map((_, i) => findKpi(kpiId, kpisPerMonth[i] ?? KPIs).target);
        const lineStyle = nk26ThisYearLineStyle(0.2);
        mount(
          id,
          lineBase(
            MONTHS,
            [
              {
                label: row0.label,
                data: MONTHS.map((_, i) => getVal(db, i, kpiId)),
                borderColor: lineStyle.borderColor,
                backgroundColor: lineStyle.backgroundColor,
                fill: true,
                pointRadius: MONTHS.map((_, i) => (i === highlight ? 6 : 3)),
              },
            ],
            targetsArr,
            "Target",
            undefined,
            highlight,
          ),
        );
      };

      switch (v) {
        case "overview":
          mount("nk26-c-trend", lineBase(MONTHS, trendDatasets(db, kpisPerMonth[0] ?? KPIs), 0, "0% vs LY (flat)"));
          simpleBar("nk26-c-overview-satisfaction", "satisfaction");
          simpleBar("nk26-c-overview-copay", "copay");
          simpleBar("nk26-c-overview-util", "util");
          simpleBar("nk26-c-overview-feedback", "feedback");
          simpleBar("nk26-c-visits", "visits");
          simpleBar("nk26-c-noshow", "noshow");
          simpleLine("nk26-c-calls", "callrate");
          simpleBar("nk26-c-revenue", "revenue");
          break;
        case "visits":
          simpleBar("nk26-c-visits2", "visits");
          simpleBar("nk26-c-annuals", "annuals");
          simpleBar("nk26-c-exec", "exec");
          break;
        case "scheduling":
          mount("nk26-c-util-noshow", utilNoshowConfig(db, kpisPerMonth, highlight));
          simpleBar("nk26-c-leads", "leads");
          simpleBar("nk26-c-ph", "ph");
          break;
        case "finance":
          mount("nk26-c-rev2", revenueChartConfig(db, colorBar, kpisPerMonth, highlight));
          simpleBar("nk26-c-copay", "copay");
          simpleBar("nk26-c-leakage", "leakage");
          simpleBar("nk26-c-shop", "shop");
          break;
        case "calls":
          simpleLine("nk26-c-callrate", "callrate");
          simpleBar("nk26-c-callvol", "callvol");
          break;
        case "nursing":
          simpleBar("nk26-c-ecg", "ecg");
          simpleBar("nk26-c-spiro", "spiro");
          simpleBar("nk26-c-nursing-annuals", "nursing_ann");
          mount("nk26-c-rn-visits", rnVisitsBarConfig(db, kpisPerMonth, highlight));
          break;
        case "specialty":
          simpleLine("nk26-c-trich", "trich");
          simpleLine("nk26-c-ht", "ht");
          simpleBar("nk26-c-fp", "fp");
          simpleLine("nk26-c-wl", "wl");
          break;
        case "compliance":
          simpleLine("nk26-c-prod", "productivity");
          simpleLine("nk26-c-exp", "survey");
          simpleLine("nk26-c-engage", "engage");
          simpleLine("nk26-c-sop", "sop");
          break;
        default:
          break;
      }
      });
    });

    return () => {
      chartFxGen.current += 1;
      chartsRef.current.forEach((c) => c.destroy());
      chartsRef.current = [];
    };
  }, [v, db, kpisPerMonth, chartThemeKey, selectedMonth]);

  const badge = (kpiId: string) => {
    const k = findKpi(kpiId, kpisForSelected);
    const val = getVal(db, selectedMonth, kpiId);
    const sc = statusColor(k, val);
    return <span className={"nk26-badge " + sc}>{formatVal(k, val)}</span>;
  };

  const miniCardRows =
    v === "overview"
      ? [
          ...OVERVIEW_PRIORITY_KPIS.map((id) => kpisForSelected.find((k) => k.id === id)).filter(
            (k): k is KpiRow => k !== undefined,
          ),
          ...kpisForSelected.filter((k) => !(OVERVIEW_PRIORITY_KPIS as readonly string[]).includes(k.id)),
        ]
      : kpisForSelected.slice(0, 18);

  const miniCards = miniCardRows.map((k) => {
    const val = getVal(db, selectedMonth, k.id);
    const ly = getLastYearVal(db, selectedMonth, k.id);
    const p = pct(k, val) ?? 0;
    const sc = statusColor(k, val);
    const dispTarget = k.unit === "$" ? "$" + k.target.toLocaleString() : k.target + k.unit;
    const yoyLabel = rateVsLastYearPct(val, ly);
    return (
      <div key={k.id} className="nk26-mini">
        <div className="nk26-kname">{k.label}</div>
        <div className={"nk26-kval " + sc}>{formatVal(k, val)}</div>
        <div className="nk26-mini-meta">
          <div className="nk26-ktarget">
            Target: {k.higher ? "≥" : "≤"} {dispTarget}
          </div>
          <div className="nk26-ktarget nk26-yoy-line">vs last year: {yoyLabel}</div>
        </div>
        <div className="nk26-bwrap">
          <div className={"nk26-bfill " + sc} style={{ width: `${p}%` }} />
        </div>
      </div>
    );
  });

  const monthKpiStats = (ids: string[]) =>
    ids.map((id) => {
      const k = findKpi(id, kpisForSelected);
      const val = getVal(db, selectedMonth, id);
      const ly = getLastYearVal(db, selectedMonth, id);
      const sc = statusColor(k, val);
      return (
        <div key={id} className={"nk26-stat " + sc}>
          <div className="nk26-slab">{k.label}</div>
          <div className={"nk26-sval " + sc}>{formatVal(k, val)}</div>
          <div className="nk26-ssub">
            Target: {k.higher ? "≥" : "≤"} {k.target}
            {k.unit} · vs LY {rateVsLastYearPct(val, ly)}
          </div>
          <div className="nk26-mwrap">
            <div
              className="nk26-mbar"
              style={{
                width: `${pct(k, val) || 0}%`,
                background:
                  sc === "green"
                    ? "var(--nk26-green)"
                    : sc === "yellow"
                      ? "var(--nk26-yellow)"
                      : sc === "red"
                        ? "var(--nk26-red)"
                        : "var(--chart-this-year)",
              }}
            />
          </div>
        </div>
      );
    });

  const visitsStats = monthKpiStats(["visits", "annuals", "exec"]);

  const overviewPriorityStats = monthKpiStats([...OVERVIEW_PRIORITY_KPIS]);

  const sectionMonthStats = VIEW_MONTH_STATS[v] ? monthKpiStats(VIEW_MONTH_STATS[v]!) : null;

  return (
    <div className="nk26-root nk26-shell">
      {v === "overview" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Performance overview</div>
            <div className="nk26-section-sub">{monthLabel}</div>
            <div id="nk26-gate-banners" />
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
          <div key={selectedMonth} className="nk26-tab-content-enter nk26-stats nk26-stats-featured">
            {overviewPriorityStats}
          </div>
          <div className="nk26-charts nk26-charts-featured">
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Ave Patient Satisfaction Score</div>
                  <div className="nk26-csub">Target: ≥ 85</div>
                </div>
                {badge("satisfaction")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-overview-satisfaction" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">% Copay Collection Rate</div>
                  <div className="nk26-csub">Target: ≥ 95%</div>
                </div>
                {badge("copay")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-overview-copay" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Doctor Utilisation</div>
                  <div className="nk26-csub">All rostered providers · target ≥ 90%</div>
                </div>
                {badge("util")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-overview-util" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">% Patients Completing Feedback</div>
                  <div className="nk26-csub">Target: ≥ 15%</div>
                </div>
                {badge("feedback")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-overview-feedback" />
              </div>
            </div>
          </div>
          <div className="nk26-section-sub nk26-overview-more-intro">All KPIs</div>
          <div key={`${selectedMonth}-mini`} className="nk26-tab-content-enter nk26-grid-mini">
            {miniCards}
          </div>
          <div className="nk26-charts">
            <div className="nk26-card nk26-card-full">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Monthly trend — % change vs same month last year</div>
                  <div className="nk26-csub">
                    Each line is ((this year − last year) ÷ last year) × 100. Enter both years under Administration →
                    NMAC master. 0% line = flat vs prior year.
                  </div>
                </div>
              </div>
              <div className="nk26-canvas nk26-canvas-trend">
                <canvas id="nk26-c-trend" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Visit volume</div>
                  <div className="nk26-csub">Target: ≥ 2,220 / month</div>
                </div>
                {badge("visits")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-visits" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">No-show rate</div>
                  <div className="nk26-csub">Target: ≤ 7%</div>
                </div>
                {badge("noshow")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-noshow" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Call answer rate</div>
                  <div className="nk26-csub">Target: ≥ 90%</div>
                </div>
                {badge("callrate")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-calls" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Revenue vs $7.9M target</div>
                  <div className="nk26-csub">Monthly run-rate tracking</div>
                </div>
                {badge("revenue")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-revenue" />
              </div>
            </div>
          </div>
          </div>
        </>
      ) : null}

      {v === "visits" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Visit volume & annual exams</div>
            <div className="nk26-section-sub">
              Monthly targets: completed visits ≥ 2,220 · annual exams ≥ 150 · executive physicals ≥ 50
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
          <div key={selectedMonth} className="nk26-tab-content-enter nk26-stats">
            {visitsStats}
          </div>
          <div className="nk26-charts">
            <div className="nk26-card nk26-card-full">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Visit volume — 12-month trend</div>
                  <div className="nk26-csub">Checked-out visits vs 2,220 target</div>
                </div>
              </div>
              <div className="nk26-canvas" style={{ height: 220 }}>
                <canvas id="nk26-c-visits2" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Annual exams</div>
                  <div className="nk26-csub">Target ≥ 150 / month</div>
                </div>
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-annuals" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Executive physicals</div>
                  <div className="nk26-csub">Target ≥ 50 / month</div>
                </div>
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-exec" />
              </div>
            </div>
          </div>
          </div>
        </>
      ) : null}

      {v === "scheduling" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Scheduling & utilization</div>
            <div className="nk26-section-sub">
              Doctor utilisation ≥ 90% (all rostered providers) · no-show rate ≤ 7% · lead conversion &gt; 70–80%
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className="nk26-tab-content-enter nk26-stats">
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            <div className="nk26-card nk26-card-full">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Doctor utilisation vs no-show rate</div>
                  <div className="nk26-csub">Dual-axis monthly comparison</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {badge("util")}
                  {badge("noshow")}
                </div>
              </div>
              <div className="nk26-canvas" style={{ height: 220 }}>
                <canvas id="nk26-c-util-noshow" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Lead → booking conversion</div>
                  <div className="nk26-csub">Target: &gt; 70–80%</div>
                </div>
                {badge("leads")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-leads" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">PH-generated visits</div>
                  <div className="nk26-csub">Target: 180–200 / associate / month</div>
                </div>
                {badge("ph")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-ph" />
              </div>
            </div>
          </div>
          </div>
        </>
      ) : null}

      {v === "finance" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Finance & revenue</div>
            <div className="nk26-section-sub">
              Revenue target: $7.9M annual · copay collection ≥ 95% · unbilled encounters &lt; 10%
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className="nk26-tab-content-enter nk26-stats">
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            <div className="nk26-card nk26-card-full">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Revenue run-rate vs $7.9M target</div>
                  <div className="nk26-csub">Monthly actuals with YTD cumulative</div>
                </div>
                {badge("revenue")}
              </div>
              <div className="nk26-canvas" style={{ height: 220 }}>
                <canvas id="nk26-c-rev2" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">% Copay Collection Rate</div>
                  <div className="nk26-csub">Target: ≥ 95%</div>
                </div>
                {badge("copay")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-copay" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Revenue leakage (unbilled)</div>
                  <div className="nk26-csub">Target: &lt; 10%</div>
                </div>
                {badge("leakage")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-leakage" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">ShopNMAC retail sales</div>
                  <div className="nk26-csub">Target: ≥ $45,000 / year ($3,750/mo)</div>
                </div>
                {badge("shop")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-shop" />
              </div>
            </div>
          </div>
          </div>
        </>
      ) : null}

      {v === "calls" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Call performance</div>
            <div className="nk26-section-sub">
              Call answer rate ≥ 90% · inbound calls ≥ 300 / month
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className="nk26-tab-content-enter nk26-stats">
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Call answer rate</div>
                  <div className="nk26-csub">Target: ≥ 90%</div>
                </div>
                {badge("callrate")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-callrate" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Inbound call volume</div>
                  <div className="nk26-csub">Target: ≥ 300 / month</div>
                </div>
                {badge("callvol")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-callvol" />
              </div>
            </div>
          </div>
          </div>
        </>
      ) : null}

      {v === "nursing" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Nursing KPIs</div>
            <div className="nk26-section-sub">
              ECG/EKG ≥ 180/mo · spirometry ≥ 20/mo · annuals supported ≥ 150/mo · RN visits (CPT 99211) target 600–700+/yr
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className="nk26-tab-content-enter nk26-stats">
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">ECG / EKG completed</div>
                  <div className="nk26-csub">Target: ≥ 180 / month</div>
                </div>
                {badge("ecg")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-ecg" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Spirometry tests</div>
                  <div className="nk26-csub">Target: ≥ 20 / month</div>
                </div>
                {badge("spiro")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-spiro" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Annual exams supported</div>
                  <div className="nk26-csub">Target: ≥ 150 / month</div>
                </div>
                {badge("nursing_ann")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-nursing-annuals" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">RN visits (CPT 99211) — YTD</div>
                  <div className="nk26-csub">Annual target: 600–700+</div>
                </div>
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-rn-visits" />
              </div>
            </div>
          </div>
          </div>
        </>
      ) : null}

      {v === "specialty" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Specialty clinics</div>
            <div className="nk26-section-sub">
              Trichology ≥ 90% · hair transplant ≥ 90% · facial plastics (target-based) · weight loss compliance ≥ 95%
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className="nk26-tab-content-enter nk26-stats">
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Trichology productivity</div>
                  <div className="nk26-csub">Target: ≥ 90%</div>
                </div>
                {badge("trich")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-trich" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Hair transplant productivity</div>
                  <div className="nk26-csub">Target: ≥ 90%</div>
                </div>
                {badge("ht")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-ht" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Facial plastics bookings</div>
                  <div className="nk26-csub">Monthly procedure bookings</div>
                </div>
                {badge("fp")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-fp" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Weight loss visit compliance</div>
                  <div className="nk26-csub">Target: ≥ 95%</div>
                </div>
                {badge("wl")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-wl" />
              </div>
            </div>
          </div>
          </div>
        </>
      ) : null}

      {v === "compliance" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Compliance & patient experience</div>
            <div className="nk26-section-sub">
              SOPs 100% current · survey score ≥ 4.7/5 · overall clinic productivity ≥ 90% · staff engagement ≥ 80%
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className="nk26-tab-content-enter nk26-stats">
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Clinic productivity (global gate)</div>
                  <div className="nk26-csub">Target: ≥ 90% — FAIL pauses all incentives</div>
                </div>
                {badge("productivity")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-prod" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Patient experience score</div>
                  <div className="nk26-csub">Target: ≥ 4.7 / 5</div>
                </div>
                {badge("survey")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-exp" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Staff engagement index</div>
                  <div className="nk26-csub">Target: ≥ 80%</div>
                </div>
                {badge("engage")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-engage" />
              </div>
            </div>
            <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">SOP compliance</div>
                  <div className="nk26-csub">Target: 100%</div>
                </div>
                {badge("sop")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-sop" />
              </div>
            </div>
          </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
