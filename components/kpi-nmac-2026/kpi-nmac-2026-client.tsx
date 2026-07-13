"use client";

import { useAppTheme, type AppThemeName } from "@/components/app-theme-provider";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChartJs from "chart.js/auto";
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
  defaultCompletedMonthIndex,
  emptyNmacMonthDbs,
  formatVal,
  getLastYearVal,
  getVal,
  isNmacKpiVisible,
  KPIs,
  loadData,
  loadTargetPack,
  monthDbHasValues,
  MONTHS,
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
import { DEFAULT_KPI_YEAR, SUPPORTED_KPI_YEARS } from "@/lib/kpi/years";
import { fetchNmacMasterMonthly } from "@/lib/supabase/nmac-master-service";
import { fetchNmacTargetMonths, fetchNmacTargets } from "@/lib/supabase/nmac-targets-service";
import { MonthTabs } from "./nmac-master-entry-panel";
import { ReferralKpiPanel } from "./referral-kpi-panel";

type Db = Record<number, MonthDb>;

function readBrowserNmacDb(year: number): Db {
  if (typeof window === "undefined") return emptyNmacMonthDbs();
  try {
    const raw = loadData(year);
    return loadUseNmacTestData() && year === DEFAULT_KPI_YEAR ? seedDemoIfEmpty(raw) : raw;
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
  scheduling: ["util", "noshow", "leads", "ph", "ai_confirmation_rate", "appt_confirm", "checkin_checkout"],
  finance: ["revenue", "net_margin", "revenue_trend", "copay", "leakage", "shop"],
  calls: ["callrate", "callvol", "call_answered", "call_missed"],
  nursing: ["bp_24hr", "ecg", "random_sugars", "spiro"],
  specialty: ["trich", "ht", "fp", "wl"],
  compliance: ["satisfaction", "feedback", "survey", "engage", "sop"],
};

function sectionStatsGridClass(count: number): string {
  const base = "nk26-tab-content-enter nk26-stats";
  if (count >= 6) return `${base} nk26-stats-cols-6`;
  if (count === 5) return `${base} nk26-stats-cols-5`;
  if (count === 4) return `${base} nk26-stats-cols-4`;
  if (count === 3) return `${base} nk26-stats-cols-3`;
  return base;
}

export function KpiNmac2026Client({ view }: Props) {
  const v: Nk26View = isNk26View(view) ? view : "overview";
  const { resolvedTheme } = useAppTheme();
  const { hiddenNmacKpiIds } = useDashboardPreferences();
  const chartThemeKey = useMemo<AppThemeName>(() => {
    if (resolvedTheme === "light" || resolvedTheme === "dark") return resolvedTheme;
    return readDocThemeClass();
  }, [resolvedTheme]);
  const [selectedYear, setSelectedYear] = useState(DEFAULT_KPI_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(defaultCompletedMonthIndex);
  const [db, setDb] = useState<Db>(() => emptyNmacMonthDbs());
  const [crmKpiSnapshot, setCrmKpiSnapshot] = useState<{
    year: number;
    values: Partial<Record<number, MonthDb>>;
    messages: Partial<Record<number, string>>;
  }>(() => ({ year: DEFAULT_KPI_YEAR, values: {}, messages: {} }));
  const [fyTargets, setFyTargets] = useState<Record<string, number>>({});
  const [targetsByMonth, setTargetsByMonth] = useState<Partial<Record<number, Record<string, number>>>>({});
  const chartsRef = useRef<Chart[]>([]);
  const pullGen = useRef(0);
  const chartFxGen = useRef(0);

  const kpisPerMonth = useMemo(
    () => buildKpisPerMonth(fyTargets, targetsByMonth, hiddenNmacKpiIds),
    [fyTargets, hiddenNmacKpiIds, targetsByMonth],
  );

  const kpisForSelected: readonly KpiRow[] = kpisPerMonth[selectedMonth] ?? kpisPerMonth[0]!;
  const crmKpiDb = useMemo(
    () => (crmKpiSnapshot.year === selectedYear ? crmKpiSnapshot.values : {}),
    [crmKpiSnapshot, selectedYear],
  );

  const displayDb = useMemo<Db>(() => {
    if (Object.keys(crmKpiDb).length === 0) return db;
    const next: Db = { ...db };
    for (const [month, values] of Object.entries(crmKpiDb)) {
      const monthIndex = Number(month);
      if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) continue;
      next[monthIndex] = { ...(next[monthIndex] ?? {}), ...values };
    }
    return next;
  }, [crmKpiDb, db]);

  const monthLabel = useMemo(
    () => `Showing: ${MONTHS[selectedMonth]} ${selectedYear} data — click a month tab to switch`,
    [selectedMonth, selectedYear],
  );

  const hydrateLocalDb = useCallback(() => {
    setDb(readBrowserNmacDb(selectedYear));
  }, [selectedYear]);

  const onYearChange = useCallback((year: number) => {
    setSelectedYear(year);
    setDb(readBrowserNmacDb(year));
    const pack = loadTargetPack(year);
    setFyTargets(pack.fy);
    setTargetsByMonth(pack.byMonth);
  }, []);

  const pullNmacFromServer = useCallback(async () => {
    const myGen = ++pullGen.current;
    const [mRes, tRes, tmRes] = await Promise.all([
      fetchNmacMasterMonthly(selectedYear),
      fetchNmacTargets(selectedYear),
      fetchNmacTargetMonths(selectedYear),
    ]);
    if (myGen !== pullGen.current) return;
    if (!mRes.error) {
      const hasRemote = Object.values(mRes.data).some(monthDbHasValues);
      if (hasRemote) {
        setDb((prev) => {
          if (stableDbEqual(prev, mRes.data)) return prev;
          saveAll(mRes.data, selectedYear);
          return mRes.data;
        });
      }
    }
    if (myGen !== pullGen.current) return;
    const prev = loadTargetPack(selectedYear);
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
      saveTargetPack({ fy: nextFy, byMonth: nextMo }, selectedYear);
    }
  }, [selectedYear]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDb(readBrowserNmacDb(selectedYear));
      const pack = loadTargetPack(selectedYear);
      setFyTargets(pack.fy);
      setTargetsByMonth(pack.byMonth);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedYear]);

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
    const timer = window.setTimeout(() => {
      void pullNmacFromServer();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      pullGen.current += 1;
    };
  }, [pullNmacFromServer]);

  useEffect(() => {
    if (v !== "overview" && v !== "scheduling") {
      return;
    }
    if (!isNmacKpiVisible("ai_confirmation_rate", hiddenNmacKpiIds)) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      MONTHS.map(async (_, monthIndex) => {
        const params = new URLSearchParams({
          year: String(selectedYear),
          month: String(monthIndex + 1),
        });
        try {
          const res = await fetch(`/api/crm/kpis/ai-confirmation-rate?${params}`, {
            credentials: "include",
            cache: "no-store",
          });
          const body = (await res.json()) as { rate_pct?: unknown; snapshot_days?: unknown; error?: unknown };
          if (!res.ok) {
            const message = typeof body.error === "string" ? body.error : "Could not load CRM AI confirmation rate.";
            return { monthIndex, message };
          }
          const rate = typeof body.rate_pct === "number" && Number.isFinite(body.rate_pct) ? body.rate_pct : null;
          if (rate === null) {
            const snapshotDays = typeof body.snapshot_days === "number" ? body.snapshot_days : null;
            return {
              monthIndex,
              message:
                snapshotDays === 0
                  ? "No AI confirmation snapshots for this month."
                  : "CRM returned no AI confirmation rate for this month.",
            };
          }
          return { monthIndex, rate };
        } catch {
          return { monthIndex, message: "Could not load CRM AI confirmation rate." };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Partial<Record<number, MonthDb>> = {};
      const messages: Partial<Record<number, string>> = {};
      results.forEach((result) => {
        if (!result) return;
        if ("rate" in result) {
          next[result.monthIndex] = { ai_confirmation_rate: { ty: result.rate } };
        } else {
          messages[result.monthIndex] = result.message;
        }
      });
      setCrmKpiSnapshot({ year: selectedYear, values: next, messages });
    });

    return () => {
      cancelled = true;
    };
  }, [hiddenNmacKpiIds, selectedYear, v]);

  useEffect(() => {
    const gen = ++chartFxGen.current;
    chartsRef.current.forEach((c) => c.destroy());
    chartsRef.current = [];

    requestAnimationFrame(() => {
      if (gen !== chartFxGen.current) return;
      const mount = (id: string, cfg: ChartConfiguration) => {
        const canvas = document.getElementById(id) as HTMLCanvasElement | null;
        if (!canvas) return;
        chartsRef.current.push(new ChartJs(canvas, cfg));
      };

      const highlight = selectedMonth;

      const simpleBar = (id: string, kpiId: string) => {
        if (!isNmacKpiVisible(kpiId, hiddenNmacKpiIds)) return;
        const row0 = findKpi(kpiId, kpisPerMonth[0] ?? KPIs);
        const targetsArr = MONTHS.map((_, i) => findKpi(kpiId, kpisPerMonth[i] ?? KPIs).target);
        const barColors = colorBar(displayDb, kpiId, targetsArr, row0.higher);
        mount(
          id,
          barBase(
            MONTHS,
            [
              {
                label: row0.label,
                data: MONTHS.map((_, i) => getVal(displayDb, i, kpiId)),
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
        if (!isNmacKpiVisible(kpiId, hiddenNmacKpiIds)) return;
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
                data: MONTHS.map((_, i) => getVal(displayDb, i, kpiId)),
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
          mount("nk26-c-trend", lineBase(MONTHS, trendDatasets(displayDb, kpisPerMonth[0] ?? KPIs), 0, "0% vs LY (flat)"));
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
          if (isNmacKpiVisible("util", hiddenNmacKpiIds) && isNmacKpiVisible("noshow", hiddenNmacKpiIds)) {
            mount("nk26-c-util-noshow", utilNoshowConfig(displayDb, kpisPerMonth, highlight));
          }
          simpleBar("nk26-c-leads", "leads");
          simpleLine("nk26-c-appt-confirm", "appt_confirm");
          simpleLine("nk26-c-checkin-checkout", "checkin_checkout");
          simpleBar("nk26-c-ph", "ph");
          simpleLine("nk26-c-ai-confirm", "ai_confirmation_rate");
          break;
        case "finance":
          if (isNmacKpiVisible("revenue", hiddenNmacKpiIds)) {
            mount("nk26-c-rev2", revenueChartConfig(displayDb, colorBar, kpisPerMonth, highlight));
          }
          simpleLine("nk26-c-net-margin", "net_margin");
          simpleLine("nk26-c-revenue-trend", "revenue_trend");
          simpleBar("nk26-c-copay", "copay");
          simpleBar("nk26-c-leakage", "leakage");
          simpleBar("nk26-c-shop", "shop");
          break;
        case "calls":
          simpleLine("nk26-c-callrate", "callrate");
          simpleBar("nk26-c-callvol", "callvol");
          simpleBar("nk26-c-call-answered", "call_answered");
          simpleBar("nk26-c-call-missed", "call_missed");
          break;
        case "nursing":
          simpleBar("nk26-c-bp-24hr", "bp_24hr");
          simpleBar("nk26-c-ecg", "ecg");
          simpleBar("nk26-c-random-sugars", "random_sugars");
          simpleBar("nk26-c-spiro", "spiro");
          if (isNmacKpiVisible("rn_visits", hiddenNmacKpiIds)) {
            mount("nk26-c-rn-visits", rnVisitsBarConfig(displayDb, kpisPerMonth, highlight));
          }
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

    return () => {
      chartFxGen.current += 1;
      chartsRef.current.forEach((c) => c.destroy());
      chartsRef.current = [];
    };
  }, [v, displayDb, hiddenNmacKpiIds, kpisPerMonth, chartThemeKey, selectedMonth]);

  const badge = (kpiId: string) => {
    if (!isNmacKpiVisible(kpiId, hiddenNmacKpiIds)) return null;
    const k = findKpi(kpiId, kpisForSelected);
    const val = getVal(displayDb, selectedMonth, kpiId);
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
    const val = getVal(displayDb, selectedMonth, k.id);
    const ly = getLastYearVal(displayDb, selectedMonth, k.id);
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
    ids.filter((id) => isNmacKpiVisible(id, hiddenNmacKpiIds)).map((id) => {
      const k = findKpi(id, kpisForSelected);
      const val = getVal(displayDb, selectedMonth, id);
      const ly = getLastYearVal(displayDb, selectedMonth, id);
      const sc = statusColor(k, val);
      const crmMessage =
        id === "ai_confirmation_rate" && crmKpiSnapshot.year === selectedYear
          ? crmKpiSnapshot.messages[selectedMonth]
          : null;
      return (
        <div key={id} className={"nk26-stat " + sc}>
          <div className="nk26-slab">{k.label}</div>
          <div className={"nk26-sval " + sc}>{formatVal(k, val)}</div>
          <div className="nk26-ssub">
            {crmMessage ? (
              crmMessage
            ) : (
              <>
                Target: {k.higher ? "≥" : "≤"} {k.target}
                {k.unit} · vs LY {rateVsLastYearPct(val, ly)}
              </>
            )}
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

  const sectionStatIds = VIEW_MONTH_STATS[v]?.filter((id) => isNmacKpiVisible(id, hiddenNmacKpiIds)) ?? null;
  const sectionMonthStats = sectionStatIds ? monthKpiStats(sectionStatIds) : null;
  const kpiVisible = (id: string) => isNmacKpiVisible(id, hiddenNmacKpiIds);
  const allKpisVisible = (ids: readonly string[]) => ids.every(kpiVisible);

  return (
    <div className="nk26-root nk26-shell">
      <div className="nk26-year-bar">
        <label className="nk26-year-label" htmlFor="nk26-reporting-year">
          Reporting year
        </label>
        <select
          id="nk26-reporting-year"
          className="nk26-year-select"
          value={String(selectedYear)}
          onChange={(e) => onYearChange(Number(e.target.value))}
        >
          {SUPPORTED_KPI_YEARS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {v === "overview" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Performance overview</div>
            <div className="nk26-section-sub">{monthLabel}</div>
            <div id="nk26-gate-banners" />
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
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
            <div className="nk26-charts-featured">
              {kpiVisible("satisfaction") ? (
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
              ) : null}
              {kpiVisible("copay") ? (
                <div className="nk26-card">
                  <div className="nk26-chd">
                    <div>
                      <div className="nk26-ctitle">Copay Collection Rate</div>
                      <div className="nk26-csub">Target: ≥ 95%</div>
                    </div>
                    {badge("copay")}
                  </div>
                  <div className="nk26-canvas">
                    <canvas id="nk26-c-overview-copay" />
                  </div>
                </div>
              ) : null}
              {kpiVisible("util") ? (
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
              ) : null}
              {kpiVisible("feedback") ? (
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
              ) : null}
            </div>
            {kpiVisible("visits") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Patient Check-Outs</div>
                  <div className="nk26-csub">Target: ≥ 2,220 / month</div>
                </div>
                {badge("visits")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-visits" />
              </div>
            </div>
            ) : null}
            {kpiVisible("noshow") ? (
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
            ) : null}
            {kpiVisible("callrate") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Telephone Calls Answered</div>
                  <div className="nk26-csub">Target: ≥ 90%</div>
                </div>
                {badge("callrate")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-calls" />
              </div>
            </div>
            ) : null}
            {kpiVisible("revenue") ? (
              <div className="nk26-card">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">Billed revenue (run-rate)</div>
                    <div className="nk26-csub">Monthly run-rate vs $7.9M target</div>
                  </div>
                  {badge("revenue")}
                </div>
                <div className="nk26-canvas">
                  <canvas id="nk26-c-revenue" />
                </div>
              </div>
            ) : null}
          </div>
          </div>
        </>
      ) : null}

      {v === "visits" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Patient check-outs & exams</div>
            <div className="nk26-section-sub">
              Monthly targets: patient check-outs ≥ 2,220 · annual / physical exams ≥ 150 · executive annual exams ≥ 50
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
          <div key={selectedMonth} className={sectionStatsGridClass(3)}>
            {visitsStats}
          </div>
          <div className="nk26-charts">
            {kpiVisible("visits") ? (
              <div className="nk26-card nk26-card-full">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Patient Check-Outs — 12-month trend</div>
                  <div className="nk26-csub">Patient check-outs vs 2,220 target</div>
                </div>
              </div>
              <div className="nk26-canvas" style={{ height: 220 }}>
                <canvas id="nk26-c-visits2" />
              </div>
            </div>
            ) : null}
            {kpiVisible("annuals") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Annual / Physical Exams</div>
                  <div className="nk26-csub">Target ≥ 150 / month</div>
                </div>
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-annuals" />
              </div>
            </div>
            ) : null}
            {kpiVisible("exec") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Executive Annual Exams</div>
                  <div className="nk26-csub">Target ≥ 50 / month</div>
                </div>
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-exec" />
              </div>
            </div>
            ) : null}
          </div>
          </div>
        </>
      ) : null}

      {v === "scheduling" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Scheduling & utilization</div>
            <div className="nk26-section-sub">
              Doctor utilisation ≥ 90% · no-show ≤ 7% · lead-to-booking conversion ≥ 75% · total population health visits · AI confirmation rate
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className={sectionStatsGridClass(sectionStatIds?.length ?? 0)}>
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            {allKpisVisible(["util", "noshow"]) ? (
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
            ) : null}
            {kpiVisible("leads") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Lead-to-Booking Conversion</div>
                  <div className="nk26-csub">Target: ≥ 75%</div>
                </div>
                {badge("leads")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-leads" />
              </div>
            </div>
            ) : null}
            {kpiVisible("appt_confirm") ? (
              <div className="nk26-card">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">Appointment confirmation rate</div>
                    <div className="nk26-csub">Target: ≥ 90%</div>
                  </div>
                  {badge("appt_confirm")}
                </div>
                <div className="nk26-canvas">
                  <canvas id="nk26-c-appt-confirm" />
                </div>
              </div>
            ) : null}
            {kpiVisible("checkin_checkout") ? (
              <div className="nk26-card">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">Avg. check-in → check-out</div>
                    <div className="nk26-csub">Target: ≤ 30 min</div>
                  </div>
                  {badge("checkin_checkout")}
                </div>
                <div className="nk26-canvas">
                  <canvas id="nk26-c-checkin-checkout" />
                </div>
              </div>
            ) : null}
            {kpiVisible("ph") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Total Population Health Visits</div>
                  <div className="nk26-csub">Target: 180–200 / associate / month</div>
                </div>
                {badge("ph")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-ph" />
              </div>
            </div>
            ) : null}
            {kpiVisible("ai_confirmation_rate") ? (
              <div className="nk26-card">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">AI Confirmation Rate</div>
                    <div className="nk26-csub">CRM daily snapshots · CONFIRMAI / (CONFIRMAI + CONFPHONE)</div>
                  </div>
                  {badge("ai_confirmation_rate")}
                </div>
                <div className="nk26-canvas">
                  <canvas id="nk26-c-ai-confirm" />
                </div>
              </div>
            ) : null}
          </div>
          </div>
        </>
      ) : null}

      {v === "finance" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Finance & revenue</div>
            <div className="nk26-section-sub">
              Copay collection rate ≥ 95% · revenue leakage &lt; 10% · ShopNMAC sales
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className={sectionStatsGridClass(sectionStatIds?.length ?? 0)}>
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            {kpiVisible("revenue") ? (
              <div className="nk26-card nk26-card-full">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">Billed revenue (run-rate) vs $7.9M target</div>
                    <div className="nk26-csub">Monthly actuals with YTD cumulative</div>
                  </div>
                  {badge("revenue")}
                </div>
                <div className="nk26-canvas" style={{ height: 220 }}>
                  <canvas id="nk26-c-rev2" />
                </div>
              </div>
            ) : null}
            {kpiVisible("net_margin") ? (
              <div className="nk26-card">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">Net income margin</div>
                    <div className="nk26-csub">Target: ≥ 15%</div>
                  </div>
                  {badge("net_margin")}
                </div>
                <div className="nk26-canvas">
                  <canvas id="nk26-c-net-margin" />
                </div>
              </div>
            ) : null}
            {kpiVisible("revenue_trend") ? (
              <div className="nk26-card">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">Revenue trend vs. prev month</div>
                    <div className="nk26-csub">Month-over-month % change</div>
                  </div>
                  {badge("revenue_trend")}
                </div>
                <div className="nk26-canvas">
                  <canvas id="nk26-c-revenue-trend" />
                </div>
              </div>
            ) : null}
            {kpiVisible("copay") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Copay Collection Rate</div>
                  <div className="nk26-csub">Target: ≥ 95%</div>
                </div>
                {badge("copay")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-copay" />
              </div>
            </div>
            ) : null}
            {kpiVisible("leakage") ? (
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
            ) : null}
            {kpiVisible("shop") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">ShopNMAC Sales ($)</div>
                  <div className="nk26-csub">Target: ≥ $45,000 / year ($3,750/mo)</div>
                </div>
                {badge("shop")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-shop" />
              </div>
            </div>
            ) : null}
          </div>
          </div>
        </>
      ) : null}

      {v === "calls" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Call performance</div>
            <div className="nk26-section-sub">
              Telephone calls answered ≥ 90% · incoming calls ≥ 300 / month
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className={sectionStatsGridClass(sectionStatIds?.length ?? 0)}>
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            {kpiVisible("callrate") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Telephone Calls Answered</div>
                  <div className="nk26-csub">Target: ≥ 90%</div>
                </div>
                {badge("callrate")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-callrate" />
              </div>
            </div>
            ) : null}
            {kpiVisible("callvol") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Incoming Calls</div>
                  <div className="nk26-csub">Target: ≥ 300 / month</div>
                </div>
                {badge("callvol")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-callvol" />
              </div>
            </div>
            ) : null}
            {kpiVisible("call_answered") ? (
              <div className="nk26-card">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">Total answered calls</div>
                    <div className="nk26-csub">Target: ≥ 270 / month</div>
                  </div>
                  {badge("call_answered")}
                </div>
                <div className="nk26-canvas">
                  <canvas id="nk26-c-call-answered" />
                </div>
              </div>
            ) : null}
            {kpiVisible("call_missed") ? (
              <div className="nk26-card">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">Total missed/abandoned calls</div>
                    <div className="nk26-csub">Target: ≤ 30 / month</div>
                  </div>
                  {badge("call_missed")}
                </div>
                <div className="nk26-canvas">
                  <canvas id="nk26-c-call-missed" />
                </div>
              </div>
            ) : null}
          </div>
          </div>
        </>
      ) : null}

      {v === "nursing" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Nursing KPIs</div>
            <div className="nk26-section-sub">
              24Hr blood pressure, ECG/EKG, random blood sugars, spirometry, and RN visits.
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className={sectionStatsGridClass(sectionStatIds?.length ?? 0)}>
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            {kpiVisible("bp_24hr") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">24Hr blood pressure</div>
                  <div className="nk26-csub">Target follows selected year</div>
                </div>
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-bp-24hr" />
              </div>
            </div>
            ) : null}
            {kpiVisible("ecg") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">ECG / EKG completed</div>
                  <div className="nk26-csub">Target follows selected year</div>
                </div>
                {badge("ecg")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-ecg" />
              </div>
            </div>
            ) : null}
            {kpiVisible("random_sugars") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Random blood sugars</div>
                  <div className="nk26-csub">Target follows selected year</div>
                </div>
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-random-sugars" />
              </div>
            </div>
            ) : null}
            {kpiVisible("spiro") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Spirometry tests</div>
                  <div className="nk26-csub">Target follows selected year</div>
                </div>
                {badge("spiro")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-spiro" />
              </div>
            </div>
            ) : null}
            {kpiVisible("rn_visits") ? (
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
            ) : null}
          </div>
          </div>
        </>
      ) : null}

      {v === "specialty" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Specialty clinics</div>
            <div className="nk26-section-sub">
              Trichology schedule productivity ≥ 90% · hair transplant session productivity ≥ 90% · facial plastics bookings · weight loss visit compliance ≥ 95%
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className={sectionStatsGridClass(sectionStatIds?.length ?? 0)}>
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            {kpiVisible("trich") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Trichology Schedule Productivity</div>
                  <div className="nk26-csub">Target: ≥ 90%</div>
                </div>
                {badge("trich")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-trich" />
              </div>
            </div>
            ) : null}
            {kpiVisible("ht") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Hair Transplant Session Productivity</div>
                  <div className="nk26-csub">Target: ≥ 90%</div>
                </div>
                {badge("ht")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-ht" />
              </div>
            </div>
            ) : null}
            {kpiVisible("fp") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Facial Plastics Bookings</div>
                  <div className="nk26-csub">Monthly procedure bookings</div>
                </div>
                {badge("fp")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-fp" />
              </div>
            </div>
            ) : null}
            {kpiVisible("wl") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Weight Loss Visit Compliance</div>
                  <div className="nk26-csub">Target: ≥ 95%</div>
                </div>
                {badge("wl")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-wl" />
              </div>
            </div>
            ) : null}
          </div>
          </div>
        </>
      ) : null}

      {v === "referrals" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Referral KPI</div>
            <div className="nk26-section-sub">
              Track referrals sent, booking rate, and pipeline outcomes from ARDTS · scoped by date sent
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <ReferralKpiPanel
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
          />
        </>
      ) : null}

      {v === "compliance" ? (
        <>
          <header className="nk26-page-head">
            <div className="nk26-section-title">Compliance & patient experience</div>
            <div className="nk26-section-sub">
              Survey score ≥ 4.7/5 · overall clinic productivity ≥ 90%
              <span className="mt-1 block text-foreground/90">{monthLabel}</span>
            </div>
          </header>
          <div key={`${v}-content`} className="nk26-route-enter">
            <MonthTabs selectedMonth={selectedMonth} onSelect={setSelectedMonth} />
            {sectionMonthStats ? (
              <div key={selectedMonth} className={sectionStatsGridClass(sectionStatIds?.length ?? 0)}>
                {sectionMonthStats}
              </div>
            ) : null}
            <div className="nk26-charts">
            {kpiVisible("productivity") ? (
              <div className="nk26-card">
              <div className="nk26-chd">
                <div>
                  <div className="nk26-ctitle">Overall Clinic Productivity (global gate)</div>
                  <div className="nk26-csub">Target: ≥ 90% — FAIL pauses all incentives</div>
                </div>
                {badge("productivity")}
              </div>
              <div className="nk26-canvas">
                <canvas id="nk26-c-prod" />
              </div>
            </div>
            ) : null}
            {kpiVisible("survey") ? (
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
            ) : null}
            {kpiVisible("engage") ? (
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
            ) : null}
            {kpiVisible("sop") ? (
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
            ) : null}
          </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
