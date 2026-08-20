"use client";

import { useAppTheme, type AppThemeName } from "@/components/app-theme-provider";
import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { Chart } from "chart.js";
import {
  clearReferralTrackedItemsHover,
  focusReferralTrackedItemsMonth,
  installReferralTrackedItemsTooltipPositioner,
  referralTrackedItemsByWorkstreamChart,
} from "@/lib/ardts/referral-charts";
import {
  boundedPercent,
  comparisonMetric,
  comparisonMetricLabel,
  referralWorkstreamColor,
} from "@/lib/ardts/referral-workstreams";
import type {
  ArdtsWorkstreamComparison,
  ArdtsWorkstreamTrends,
  ArdtsYearToDate,
} from "@/lib/ardts/types";

let chartJsModule: Promise<typeof import("chart.js/auto")> | null = null;

function loadChartJs() {
  chartJsModule ??= import("chart.js/auto").then((mod) => {
    installReferralTrackedItemsTooltipPositioner(
      mod.Tooltip.positioners as unknown as Parameters<
        typeof installReferralTrackedItemsTooltipPositioner
      >[0],
    );
    return mod;
  });
  return chartJsModule;
}

function readDocThemeClass(): AppThemeName {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function workstreamColorStyle(key: string, index: number): CSSProperties {
  return {
    "--nk26-workstream-color": referralWorkstreamColor(key, index),
  } as CSSProperties;
}

function formatDateRange(from: string, to: string): string {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  };
  const start = parse(from);
  const end = parse(to);
  if (!start || !end) return `${from} through ${to}`;

  const startLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(end);
  return `${startLabel} through ${endLabel}`;
}

function TrackedItemsByMonthChart({
  trends,
  selectedMonth,
}: {
  trends: ArdtsWorkstreamTrends;
  selectedMonth: number;
}) {
  const { resolvedTheme } = useAppTheme();
  const chartThemeKey = useMemo<AppThemeName>(() => {
    if (resolvedTheme === "light" || resolvedTheme === "dark") return resolvedTheme;
    return readDocThemeClass();
  }, [resolvedTheme]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const keyboardMonthRef = useRef(selectedMonth);

  useEffect(() => {
    keyboardMonthRef.current = selectedMonth;
  }, [selectedMonth]);

  useEffect(() => {
    let cancelled = false;

    void loadChartJs().then((mod) => {
      if (cancelled || !canvasRef.current) return;
      chartRef.current?.destroy();
      chartRef.current = new mod.default(
        canvasRef.current,
        referralTrackedItemsByWorkstreamChart(trends, selectedMonth),
      );
      if (document.activeElement === canvasRef.current) {
        focusReferralTrackedItemsMonth(chartRef.current, keyboardMonthRef.current);
      }
    });

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [chartThemeKey, selectedMonth, trends]);

  function handleChartKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (!chartRef.current) return;
    const lastMonthIndex = Math.max(0, trends.tracked_items_by_month.length - 1);
    let nextMonth = keyboardMonthRef.current;
    if (event.key === "ArrowLeft") nextMonth = Math.max(0, nextMonth - 1);
    else if (event.key === "ArrowRight") nextMonth = Math.min(lastMonthIndex, nextMonth + 1);
    else if (event.key === "Home") nextMonth = 0;
    else if (event.key === "End") nextMonth = lastMonthIndex;
    else return;
    event.preventDefault();
    keyboardMonthRef.current = nextMonth;
    focusReferralTrackedItemsMonth(chartRef.current, nextMonth);
  }

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      role="img"
      aria-describedby="nk26-tracked-items-hover-help"
      aria-label="Tracked items by month, stacked by referrals, external diagnostics, and in-house ultrasounds. Hover a colored segment for its count or the open area around a month for its all-workstreams total."
      onFocus={() => {
        keyboardMonthRef.current = selectedMonth;
        if (chartRef.current) focusReferralTrackedItemsMonth(chartRef.current, selectedMonth);
      }}
      onBlur={() => {
        if (chartRef.current) clearReferralTrackedItemsHover(chartRef.current);
      }}
      onKeyDown={handleChartKeyDown}
    />
  );
}

function WorkstreamComparisonTable({ comparison }: { comparison: ArdtsWorkstreamComparison }) {
  return (
    <section className="nk26-referral-section" aria-labelledby="nk26-workstream-comparison-title">
      <div id="nk26-workstream-comparison-title" className="nk26-section-sub">
        Workstream comparison
      </div>
      <p className="nk26-referral-section-note">
        One combined view with workstream-specific stages shown as not applicable where appropriate.
      </p>
      <div className="nk26-workstream-table-card">
        <div className="nk26-workstream-table-scroll">
          <table className="nk26-workstream-table">
            <caption className="sr-only">Selected-period workstream status comparison</caption>
            <thead>
              <tr>
                <th scope="col">Workstream</th>
                {comparison.columns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row, rowIndex) => (
                <tr key={row.key} className={row.is_total ? "nk26-workstream-total-row" : undefined}>
                  <th scope="row">
                    <span className="nk26-workstream-name">
                      {!row.is_total ? (
                        <span
                          className="nk26-workstream-dot"
                          style={workstreamColorStyle(row.key, rowIndex)}
                          aria-hidden="true"
                        />
                      ) : null}
                      {row.label}
                    </span>
                  </th>
                  {comparison.columns.map((column) => {
                    const metric = comparisonMetric(row, column.key);
                    const percentLabel =
                      column.key !== "total" && metric?.applicable && metric.percent !== null
                        ? `${metric.percent}% of ${row.label} total`
                        : undefined;
                    return (
                      <td key={column.key} title={percentLabel}>
                        {comparisonMetricLabel(metric)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function WorkstreamTrends({
  trends,
  selectedMonth,
}: {
  trends: ArdtsWorkstreamTrends;
  selectedMonth: number;
}) {
  return (
    <section className="nk26-referral-section" aria-labelledby="nk26-workstream-trends-title">
      <div id="nk26-workstream-trends-title" className="nk26-section-sub">
        Workstream trends
      </div>
      <div className="nk26-referral-trends-grid">
        <figure className="nk26-card nk26-referral-trend-card">
          <figcaption className="nk26-chd nk26-referral-chart-head">
            <div>
              <div className="nk26-ctitle">Tracked items by month</div>
              <div className="nk26-csub">Volume stacked by workstream</div>
            </div>
            <div className="nk26-workstream-legend" aria-label="Workstream colors">
              {trends.series.map((series, index) => (
                <span key={series.key} className="nk26-workstream-legend-item">
                  <span
                    className="nk26-workstream-legend-swatch"
                    style={workstreamColorStyle(series.key, index)}
                    aria-hidden="true"
                  />
                  {series.label}
                </span>
              ))}
            </div>
          </figcaption>
          <div className="nk26-referral-chart-scroll">
            <div className="nk26-referral-chart-surface">
              <div className="nk26-canvas nk26-referral-workstream-canvas">
                <TrackedItemsByMonthChart trends={trends} selectedMonth={selectedMonth} />
              </div>
            </div>
          </div>
          <table className="sr-only">
            <caption>Monthly tracked items by workstream</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                {trends.series.map((series) => (
                  <th key={series.key} scope="col">
                    {series.label}
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {trends.tracked_items_by_month.map((point) => (
                <tr key={point.month}>
                  <th scope="row">{point.month_label}</th>
                  {trends.series.map((series) => (
                    <td key={series.key}>{point.workstreams[series.key] ?? 0}</td>
                  ))}
                  <td>{point.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p id="nk26-tracked-items-hover-help" className="nk26-referral-hover-note">
            Hover a colored segment for its count, or the open area around a month for its all-workstreams total.
            Keyboard: focus the chart and use the left or right arrow keys to move by month.
          </p>
        </figure>

        <article className="nk26-card nk26-referral-trend-card">
          <div className="nk26-chd">
            <div>
              <div className="nk26-ctitle">Needs booking rate</div>
              <div className="nk26-csub">Current selected-period backlog by workstream</div>
            </div>
          </div>
          <div className="nk26-booking-rates" role="list">
            {trends.needs_booking_rate.map((rate, index) => {
              const width = boundedPercent(rate.percent);
              return (
                <div key={rate.workstream} className="nk26-booking-rate-row" role="listitem">
                  <span className="nk26-booking-rate-label">{rate.label}</span>
                  <span
                    className="nk26-booking-rate-track"
                    role="progressbar"
                    aria-label={`${rate.label}: ${rate.count} of ${rate.total} need booking`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={width}
                  >
                    <span
                      className="nk26-booking-rate-fill"
                      style={{ ...workstreamColorStyle(rate.workstream, index), width: `${width}%` }}
                    />
                  </span>
                  <strong className="nk26-booking-rate-value">{rate.percent}%</strong>
                </div>
              );
            })}
          </div>
          <p className="nk26-booking-rate-note">
            Rates use each workstream&apos;s own total as the denominator. Diagnostic-only stages remain separate
            instead of being blended into a universal completion rate.
          </p>
        </article>
      </div>
    </section>
  );
}

function YearToDateSummary({ yearToDate }: { yearToDate: ArdtsYearToDate }) {
  return (
    <section className="nk26-referral-section nk26-referral-ytd" aria-labelledby="nk26-ytd-title">
      <div id="nk26-ytd-title" className="nk26-section-sub">
        Year-to-date summary
      </div>
      <p className="nk26-referral-section-note">
        {formatDateRange(yearToDate.from, yearToDate.to)} across all workstreams.
      </p>
      <div className="nk26-stats nk26-referral-ytd-cards">
        {yearToDate.cards.map((card) => {
          const value = !card.applicable ? "N/A" : (card.count ?? "—");
          const supportingText = !card.applicable
            ? "Not applicable for this scope"
            : card.key === "tracked"
              ? (card.description ?? "Tracked items year to date")
              : card.percent === null
                ? (card.description ?? "Year-to-date value")
                : `${card.percent}% of YTD tracked items`;
          return (
            <div key={card.key} className="nk26-stat nk26-referral-ytd-card" title={card.description}>
              <div className="nk26-slab">{card.label}</div>
              <div className="nk26-sval">{value}</div>
              <div className="nk26-ssub">{supportingText}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ReferralWorkstreamSections({
  comparison,
  trends,
  yearToDate,
  selectedMonth,
}: {
  comparison?: ArdtsWorkstreamComparison;
  trends?: ArdtsWorkstreamTrends;
  yearToDate?: ArdtsYearToDate;
  selectedMonth: number;
}) {
  if (!comparison && !trends && !yearToDate) return null;

  return (
    <>
      {comparison ? <WorkstreamComparisonTable comparison={comparison} /> : null}
      {trends ? <WorkstreamTrends trends={trends} selectedMonth={selectedMonth} /> : null}
      {yearToDate ? <YearToDateSummary yearToDate={yearToDate} /> : null}
    </>
  );
}
