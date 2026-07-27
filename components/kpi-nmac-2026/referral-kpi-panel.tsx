"use client";

import { useAppTheme, type AppThemeName } from "@/components/app-theme-provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chart, ChartConfiguration } from "chart.js";
import {
  referralOutcomeExpandedChart,
  referralSentExpandedChart,
  referralStatusBreakdownExpandedChart,
} from "@/lib/ardts/referral-charts";
import { orderReferralStatusCards } from "@/lib/ardts/referral-display";
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
  return new URLSearchParams({
    year: String(year),
    month: String(monthIndex + 1),
    item_type: "all",
    delivery_workstream: "all",
    operational_type: "all",
  }).toString();
}

function formatPercent(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value}%` : "—";
}

export function ReferralKpiPanel({ selectedYear, selectedMonth, onSelectMonth }: Props) {
  const { resolvedTheme } = useAppTheme();
  const chartThemeKey = useMemo<AppThemeName>(() => {
    if (resolvedTheme === "light" || resolvedTheme === "dark") return resolvedTheme;
    return readDocThemeClass();
  }, [resolvedTheme]);

  const [data, setData] = useState<ArdtsStatusCountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const refresh = useCallback(() => {
    void loadPeriod();
  }, [loadPeriod]);

  useEffect(() => {
    void loadPeriod();
  }, [loadPeriod]);

  const periodLabel = useMemo(() => {
    if (data?.metadata?.period_label) {
      const tz = data.metadata.timezone.replace(/_/g, " ");
      return `Period: ${data.metadata.period_label} (${tz})`;
    }
    if (!data?.range) return null;
    const tz = data.range.timezone.replace(/_/g, " ");
    return `Period: ${data.range.from} to ${data.range.to} (${tz})`;
  }, [data]);

  useEffect(() => {
    if (!data || loading) return;

    const gen = ++chartFxGen.current;
    const charts = data.charts;
    const sentByMonth = charts?.referrals_sent_by_month ?? [];
    const outcomesByMonth = charts?.booked_vs_needs_action ?? [];
    const statusBreakdown = orderReferralStatusCards(
      charts?.status_breakdown_selected_period ?? data.all_statuses_in_period?.cards ?? [],
    );

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

      mount("nk26-c-ref-sent", referralSentExpandedChart(sentByMonth, selectedMonth));
      mount("nk26-c-ref-outcomes", referralOutcomeExpandedChart(outcomesByMonth, selectedMonth));
      mount("nk26-c-ref-status", referralStatusBreakdownExpandedChart(statusBreakdown));
    });

    return () => {
      chartFxGen.current += 1;
      chartsRef.current.forEach((c) => c.destroy());
      chartsRef.current = [];
    };
  }, [data, loading, selectedMonth, chartThemeKey]);

  const statusCards = useMemo(
    () => orderReferralStatusCards(data?.all_statuses_in_period?.cards ?? []),
    [data],
  );
  const summary = data?.period_summary ?? null;
  const pipelineStages = data?.pipeline_stages ?? [];
  const selectedOutcome = data?.charts?.booked_vs_needs_action?.find((row) => row.month === selectedMonth + 1);
  const hasCharts = Boolean(data?.charts);

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
          All referral and diagnostic workstreams sent in {MONTHS[selectedMonth]} {selectedYear} by{" "}
          <strong>date sent</strong>. Status cards, KPI rates, and pipeline stages are calculated by ARDTS.
        </p>
        {periodLabel ? <p className="nk26-referral-period">{periodLabel}</p> : null}
      </div>

      {loading ? <p className="nk26-referral-status">Loading referral data from ARDTS…</p> : null}
      {error ? (
        <div className="nk26-referral-error" role="alert">
          {error}
        </div>
      ) : null}

      {!loading && !error && data && summary ? (
        <>
          <div className="nk26-section-sub nk26-overview-more-intro">All statuses in period</div>
          <div className="nk26-stats nk26-referral-cards">
            {statusCards.map((card) => {
              return (
                <div
                  key={card.key}
                  className={"nk26-stat" + (card.key === "total" ? " nk26-referral-total" : "")}
                >
                  <div className="nk26-slab">{card.label}</div>
                  <div className="nk26-sval">{card.count}</div>
                  <div className="nk26-ssub">
                    {card.description ??
                      (card.key === "total" ? "All tracked referrals in period" : `${card.percent}% of period total`)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="nk26-section-sub nk26-overview-more-intro">Period summary</div>
          <div className="nk26-stats nk26-referral-kpi-row">
            <div className="nk26-stat nk26-referral-total">
              <div className="nk26-slab">Sent in period</div>
              <div className="nk26-sval">{summary.sent_in_period}</div>
              <div className="nk26-ssub">Total tracked referrals in selected month</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">Booking rate</div>
              <div className="nk26-sval">{formatPercent(summary.booking_rate)}</div>
              <div className="nk26-ssub">Booked-or-beyond ÷ sent in period</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">Booked-or-beyond</div>
              <div className="nk26-sval">{selectedOutcome?.booked_or_beyond ?? "—"}</div>
              <div className="nk26-ssub">Server-calculated booked pipeline count</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">Completion rate</div>
              <div className="nk26-sval">{formatPercent(summary.completion_rate)}</div>
              <div className="nk26-ssub">Completed + results FU attended</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">Finish rate</div>
              <div className="nk26-sval">{formatPercent(summary.finish_rate)}</div>
              <div className="nk26-ssub">Completed, results FU attended, or closed</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">Needs action</div>
              <div className="nk26-sval">{summary.needs_action.count}</div>
              <div className="nk26-ssub">{summary.needs_action.percent}% of period total</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">YTD sent</div>
              <div className="nk26-sval">{summary.ytd_sent}</div>
              <div className="nk26-ssub">January 1 through selected period end</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">YTD booked</div>
              <div className="nk26-sval">{summary.ytd_booked}</div>
              <div className="nk26-ssub">Booked-or-beyond year to date</div>
            </div>
          </div>

          <div className="nk26-section-sub nk26-overview-more-intro">Pipeline stages in period</div>
          <div className="nk26-referral-funnel">
            {pipelineStages.map((stage) => {
              return (
                <div key={stage.key} className="nk26-stat">
                  <div className="nk26-slab">{stage.label}</div>
                  <div className="nk26-sval">{stage.count}</div>
                  <div className="nk26-ssub">{stage.percent}% of period total</div>
                </div>
              );
            })}
          </div>

          {hasCharts ? (
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
                    <div className="nk26-csub">Monthly booked-or-beyond vs items needing action</div>
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
