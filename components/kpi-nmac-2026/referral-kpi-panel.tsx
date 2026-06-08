"use client";

import { useAppTheme, type AppThemeName } from "@/components/app-theme-provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chart, ChartConfiguration } from "chart.js";
import {
  monthDateBounds,
  REFERRAL_STATUS_CARDS,
  referralCountForCard,
} from "@/lib/ardts/referral-display";
import {
  referralOutcomeMonthlyChart,
  referralSentMonthlyChart,
  referralStatusBreakdownChart,
} from "@/lib/ardts/referral-charts";
import {
  funnelGroupCount,
  referralMetrics,
  REFERRAL_FUNNEL_GROUPS,
  type ReferralYearlyResponse,
} from "@/lib/ardts/referral-metrics";
import type { ArdtsStatusCountsResponse } from "@/lib/ardts/types";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";
import { MonthTabs } from "./nmac-master-entry-panel";
import "./nk26.css";

let chartJsModule: Promise<typeof import("chart.js/auto")> | null = null;
function loadChartJs() {
  chartJsModule ??= import("chart.js/auto");
  return chartJsModule;
}

function readDocThemeClass(): AppThemeName {
  if (typeof document === "undefined") return "dark";
  if (document.documentElement.classList.contains("light")) return "light";
  return "dark";
}

type Props = {
  selectedYear: number;
  selectedMonth: number;
  onSelectMonth: (monthIndex: number) => void;
};

function buildMonthQuery(year: number, monthIndex: number): string {
  const { from, to } = monthDateBounds(year, monthIndex);
  return new URLSearchParams({ range: "custom", from, to }).toString();
}

export function ReferralKpiPanel({ selectedYear, selectedMonth, onSelectMonth }: Props) {
  const { resolvedTheme } = useAppTheme();
  const chartThemeKey = useMemo<AppThemeName>(() => {
    if (resolvedTheme === "light" || resolvedTheme === "dark") return resolvedTheme;
    return readDocThemeClass();
  }, [resolvedTheme]);

  const [data, setData] = useState<ArdtsStatusCountsResponse | null>(null);
  const [yearly, setYearly] = useState<ReferralYearlyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearlyLoading, setYearlyLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yearlyError, setYearlyError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const chartsRef = useRef<Chart[]>([]);
  const chartFxGen = useRef(0);

  const query = useMemo(
    () => buildMonthQuery(selectedYear, selectedMonth),
    [selectedYear, selectedMonth],
  );

  const loadPeriod = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/referrals/status-counts?${query}`, { cache: "no-store" });
      const body = (await res.json()) as ArdtsStatusCountsResponse | { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof body === "object" && body && "error" in body && typeof body.error === "string"
            ? body.error
            : "Could not load referral counts.",
        );
      }
      setData(body as ArdtsStatusCountsResponse);
      setFetchedAt(new Date());
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load referral counts.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const loadYearly = useCallback(async () => {
    setYearlyLoading(true);
    setYearlyError(null);
    try {
      const res = await fetch(`/api/referrals/yearly?year=${selectedYear}`, { cache: "no-store" });
      const body = (await res.json()) as ReferralYearlyResponse | { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof body === "object" && body && "error" in body && typeof body.error === "string"
            ? body.error
            : "Could not load yearly referral trend.",
        );
      }
      setYearly(body as ReferralYearlyResponse);
    } catch (e) {
      setYearly(null);
      setYearlyError(e instanceof Error ? e.message : "Could not load yearly referral trend.");
    } finally {
      setYearlyLoading(false);
    }
  }, [selectedYear]);

  const refresh = useCallback(() => {
    void loadPeriod();
    void loadYearly();
  }, [loadPeriod, loadYearly]);

  useEffect(() => {
    void loadPeriod();
  }, [loadPeriod]);

  useEffect(() => {
    void loadYearly();
  }, [loadYearly]);

  const metrics = useMemo(() => (data ? referralMetrics(data) : null), [data]);

  const periodLabel = useMemo(() => {
    if (!data?.range) return null;
    const tz = data.range.timezone.replace(/_/g, " ");
    return `Period: ${data.range.from} to ${data.range.to} (${tz})`;
  }, [data]);

  useEffect(() => {
    if (!data || !yearly || loading || yearlyLoading) return;

    const gen = ++chartFxGen.current;
    const months = yearly.months;

    void loadChartJs().then((mod) => {
      if (gen !== chartFxGen.current) return;
      const ChartCtor = mod.default;
      chartsRef.current.forEach((c) => c.destroy());
      chartsRef.current = [];

      const mount = (id: string, config: ChartConfiguration) => {
        const canvas = document.getElementById(id) as HTMLCanvasElement | null;
        if (!canvas) return;
        chartsRef.current.push(new ChartCtor(canvas, config));
      };

      mount("nk26-c-ref-sent", referralSentMonthlyChart(months, selectedMonth));
      mount("nk26-c-ref-outcomes", referralOutcomeMonthlyChart(months, selectedMonth));
      mount("nk26-c-ref-status", referralStatusBreakdownChart(data));
    });

    return () => {
      chartFxGen.current += 1;
      chartsRef.current.forEach((c) => c.destroy());
      chartsRef.current = [];
    };
  }, [data, yearly, loading, yearlyLoading, selectedMonth, chartThemeKey]);

  const ytdTotal = useMemo(() => {
    if (!yearly) return 0;
    return yearly.months.reduce((sum, m) => sum + m.total, 0);
  }, [yearly]);

  const ytdBooked = useMemo(() => {
    if (!yearly) return 0;
    return yearly.months.reduce((sum, m) => sum + m.booked, 0);
  }, [yearly]);

  return (
    <div key="referrals-content" className="nk26-route-enter">
      <MonthTabs selectedMonth={selectedMonth} onSelect={onSelectMonth} />

      <div className="nk26-referral-actions">
        <button type="button" className="nk26-btn nk26-btn-sec" onClick={refresh}>
          Refresh
        </button>
        {fetchedAt ? (
          <p className="nk26-referral-period">
            As of {fetchedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}
          </p>
        ) : null}
      </div>

      <div className="nk26-referral-meta">
        <p className="nk26-referral-note">
          Referrals sent in {MONTHS[selectedMonth]} {selectedYear} (by <strong>date sent</strong>, business hours
          only).
        </p>
        {periodLabel ? <p className="nk26-referral-period">{periodLabel}</p> : null}
      </div>

      {loading || yearlyLoading ? <p className="nk26-referral-status">Loading referral data from ARDTS…</p> : null}
      {error ? (
        <div className="nk26-referral-error" role="alert">
          {error}
        </div>
      ) : null}
      {yearlyError ? (
        <div className="nk26-referral-error" role="alert">
          {yearlyError}
        </div>
      ) : null}

      {!loading && !error && metrics ? (
        <>
          <div className="nk26-section-sub nk26-overview-more-intro">All statuses in period</div>
          <div className="nk26-stats nk26-referral-cards">
            {REFERRAL_STATUS_CARDS.map((card) => {
              const count = referralCountForCard(card.key, metrics.total, data?.counts ?? {});
              return (
                <div
                  key={card.key}
                  className={"nk26-stat" + (card.key === "total" ? " nk26-referral-total" : "")}
                >
                  <div className="nk26-slab">{card.label}</div>
                  <div className="nk26-sval">{count}</div>
                  <div className="nk26-ssub">{card.sub}</div>
                </div>
              );
            })}
          </div>

          <div className="nk26-section-sub nk26-overview-more-intro">Period summary</div>
          <div className="nk26-stats nk26-referral-kpi-row">
            <div className="nk26-stat nk26-referral-total">
              <div className="nk26-slab">Sent in period</div>
              <div className="nk26-sval">{metrics.total}</div>
              <div className="nk26-ssub">Referrals sent during selected month</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">Booking rate</div>
              <div className="nk26-sval">{metrics.bookingRate}</div>
              <div className="nk26-ssub">{metrics.booked} booked ÷ {metrics.total} sent</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">Completion rate</div>
              <div className="nk26-sval">{metrics.completionRate}</div>
              <div className="nk26-ssub">Attended, follow-up, or closed</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">Needs action</div>
              <div className="nk26-sval">{metrics.backlog}</div>
              <div className="nk26-ssub">{metrics.needsActionRate} of period total</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">YTD sent ({selectedYear})</div>
              <div className="nk26-sval">{ytdTotal}</div>
              <div className="nk26-ssub">{ytdBooked} booked year to date</div>
            </div>
          </div>

          <div className="nk26-section-sub nk26-overview-more-intro">Pipeline stages in period</div>
          <div className="nk26-referral-funnel">
            {REFERRAL_FUNNEL_GROUPS.map((group) => {
              const count = data ? funnelGroupCount(data.counts, group) : 0;
              return (
                <div key={group.id} className="nk26-stat">
                  <div className="nk26-slab">{group.label}</div>
                  <div className="nk26-sval">{count}</div>
                  <div className="nk26-ssub">{group.sub}</div>
                </div>
              );
            })}
          </div>

          {!yearlyLoading && yearly ? (
            <div className="nk26-charts">
              <div className="nk26-card">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">Referrals sent by month</div>
                    <div className="nk26-csub">{selectedYear} — items sent per calendar month</div>
                  </div>
                </div>
                <div className="nk26-canvas">
                  <canvas id="nk26-c-ref-sent" />
                </div>
              </div>
              <div className="nk26-card">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">Booked vs needs action</div>
                    <div className="nk26-csub">Monthly outcomes for referrals sent that month</div>
                  </div>
                </div>
                <div className="nk26-canvas">
                  <canvas id="nk26-c-ref-outcomes" />
                </div>
              </div>
              <div className="nk26-card nk26-card-full">
                <div className="nk26-chd">
                  <div>
                    <div className="nk26-ctitle">Status breakdown — selected month</div>
                    <div className="nk26-csub">
                      {data?.range.from} to {data?.range.to}
                    </div>
                  </div>
                </div>
                <div className="nk26-canvas nk26-canvas-trend">
                  <canvas id="nk26-c-ref-status" />
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
