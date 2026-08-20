import type {
  ActiveDataPoint,
  Chart,
  ChartConfiguration,
  Plugin,
  TooltipItem,
  TooltipPositionerFunction,
} from "chart.js";
import {
  barBase,
  emphasizeSelectedMonthBarColors,
  resolveNk26ChartTheme,
  resolveNk26CssColor,
} from "@/lib/kpi-nmac-2026/chart-config";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";
import { REFERRAL_STATUS_CARDS } from "@/lib/ardts/referral-display";
import type { ReferralMonthlyPoint } from "@/lib/ardts/referral-metrics";
import {
  buildTrackedItemsChartData,
  nearestTrackedMonthIndex,
} from "@/lib/ardts/referral-workstreams";
import type {
  ArdtsMonthlyOutcomePoint,
  ArdtsMonthlySentPoint,
  ArdtsStatusCard,
  ArdtsStatusCountsResponse,
  ArdtsWorkstreamTrends,
} from "@/lib/ardts/types";

const STATUS_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#a78bfa",
  "#06b6d4",
  "#ec4899",
  "#64748b",
];

function monthTotals(months: ReferralMonthlyPoint[], pick: (m: ReferralMonthlyPoint) => number): number[] {
  const byIndex = new Map(months.map((m) => [m.monthIndex, m]));
  return MONTHS.map((_, i) => pick(byIndex.get(i) ?? { monthIndex: i, total: 0, booked: 0, booking_pending: 0, need_help: 0, completed: 0, closed: 0, from: "", to: "" }));
}

export function referralSentMonthlyChart(
  months: ReferralMonthlyPoint[],
  highlightMonth?: number,
): ChartConfiguration {
  const theme = resolveNk26ChartTheme();
  const accent = resolveNk26CssColor("--chart-this-year", "#2563eb");
  const totals = monthTotals(months, (m) => m.total);
  const colors = emphasizeSelectedMonthBarColors(
    totals.map(() => accent),
    highlightMonth ?? -1,
  );

  return barBase(MONTHS, [{ label: "Referrals sent", data: totals, backgroundColor: colors }], undefined, theme, highlightMonth);
}

function chartMonthIndex(month: number): number {
  return Math.max(0, Math.min(11, month - 1));
}

type ReferralHoverTarget =
  | { mode: "whole"; dataIndex: number }
  | { mode: "segment"; dataIndex: number; datasetIndex: number }
  | null;

type DrawableBar = {
  x: number;
  y: number;
  base: number;
  width: number;
  draw: (context: CanvasRenderingContext2D) => void;
  inRange: (x: number, y: number, useFinalPosition?: boolean) => boolean;
};

type ReferralHoverMotion = {
  target: ReferralHoverTarget;
  wholeProgress: number;
  segmentProgress: number;
  fromWhole: number;
  fromSegment: number;
  toWhole: number;
  toSegment: number;
  startedAt: number;
  frame: number | null;
};

const REFERRAL_HOVER_DURATION_MS = 155;
const referralHoverMotion = new WeakMap<Chart, ReferralHoverMotion>();

function drawableBar(chart: Chart, datasetIndex: number, dataIndex: number): DrawableBar | null {
  return (chart.getDatasetMeta(datasetIndex).data[dataIndex] as unknown as DrawableBar | undefined) ?? null;
}

function visibleBarDatasetIndexes(chart: Chart): number[] {
  return chart.data.datasets.flatMap((_, datasetIndex) => {
    const meta = chart.getDatasetMeta(datasetIndex);
    return meta.visible && meta.type === "bar" ? [datasetIndex] : [];
  });
}

function ensureReferralHoverMotion(chart: Chart): ReferralHoverMotion {
  const existing = referralHoverMotion.get(chart);
  if (existing) return existing;
  const state: ReferralHoverMotion = {
    target: null,
    wholeProgress: 0,
    segmentProgress: 0,
    fromWhole: 0,
    fromSegment: 0,
    toWhole: 0,
    toSegment: 0,
    startedAt: 0,
    frame: null,
  };
  referralHoverMotion.set(chart, state);
  return state;
}

function sameReferralHoverTarget(a: ReferralHoverTarget, b: ReferralHoverTarget): boolean {
  if (!a || !b) return a === b;
  return a.mode === b.mode &&
    a.dataIndex === b.dataIndex &&
    (a.mode !== "segment" || b.mode !== "segment" || a.datasetIndex === b.datasetIndex);
}

function animateReferralHover(chart: Chart, state: ReferralHoverMotion): void {
  if (state.frame !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.frame);
  }
  state.fromWhole = state.wholeProgress;
  state.fromSegment = state.segmentProgress;
  state.toWhole = state.target?.mode === "whole" ? 1 : 0;
  state.toSegment = state.target?.mode === "segment" ? 1 : 0;
  state.startedAt = typeof performance === "undefined" ? 0 : performance.now();

  if (typeof requestAnimationFrame !== "function") {
    state.wholeProgress = state.toWhole;
    state.segmentProgress = state.toSegment;
    chart.draw();
    return;
  }

  const tick = (now: number) => {
    const elapsed = Math.max(0, now - state.startedAt);
    const progress = Math.min(1, elapsed / REFERRAL_HOVER_DURATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    state.wholeProgress = state.fromWhole + (state.toWhole - state.fromWhole) * eased;
    state.segmentProgress = state.fromSegment + (state.toSegment - state.fromSegment) * eased;
    chart.draw();
    if (progress < 1) {
      state.frame = requestAnimationFrame(tick);
    } else {
      state.frame = null;
    }
  };
  state.frame = requestAnimationFrame(tick);
}

function targetActivePoints(chart: Chart, target: ReferralHoverTarget): ActiveDataPoint[] {
  if (!target) return [];
  if (target.mode === "segment") {
    return drawableBar(chart, target.datasetIndex, target.dataIndex)
      ? [{ datasetIndex: target.datasetIndex, index: target.dataIndex }]
      : [];
  }
  const datasetIndex = visibleBarDatasetIndexes(chart).find((candidate) =>
    drawableBar(chart, candidate, target.dataIndex),
  );
  return datasetIndex === undefined
    ? []
    : [{ datasetIndex, index: target.dataIndex }];
}

function stackGeometry(chart: Chart, dataIndex: number): { x: number; top: number; base: number } | null {
  const bars = visibleBarDatasetIndexes(chart)
    .map((datasetIndex) => drawableBar(chart, datasetIndex, dataIndex))
    .filter((bar): bar is DrawableBar => Boolean(bar));
  if (bars.length === 0) return null;
  return {
    x: bars[0]!.x,
    top: Math.min(...bars.flatMap((bar) => [bar.y, bar.base])),
    base: Math.max(...bars.flatMap((bar) => [bar.y, bar.base])),
  };
}

function setReferralHoverTarget(chart: Chart, target: ReferralHoverTarget): void {
  const state = ensureReferralHoverMotion(chart);
  const changed = !sameReferralHoverTarget(state.target, target);
  state.target = target;
  const active = targetActivePoints(chart, target);
  chart.setActiveElements(active);
  const geometry = target ? stackGeometry(chart, target.dataIndex) : null;
  chart.tooltip?.setActiveElements(active, {
    x: geometry?.x ?? chart.chartArea.left,
    y: geometry?.top ?? chart.chartArea.bottom,
  });
  if (changed) animateReferralHover(chart, state);
  else chart.draw();
}

function directReferralSegment(
  chart: Chart,
  dataIndex: number,
  x: number,
  y: number,
): { datasetIndex: number; dataIndex: number } | null {
  for (const datasetIndex of visibleBarDatasetIndexes(chart).reverse()) {
    const bar = drawableBar(chart, datasetIndex, dataIndex);
    if (bar?.inRange(x, y, true)) return { datasetIndex, dataIndex };
  }
  return null;
}

function referralTargetAtPoint(chart: Chart, x: number, y: number): ReferralHoverTarget {
  if (y < chart.chartArea.top - 10 || y > chart.chartArea.bottom + 8) return null;
  const firstDataset = visibleBarDatasetIndexes(chart)[0];
  if (firstDataset === undefined) return null;
  const centers = chart.getDatasetMeta(firstDataset).data.map((element) => element.x);
  const dataIndex = nearestTrackedMonthIndex(centers, x);
  if (dataIndex === null) return null;
  const segment = directReferralSegment(chart, dataIndex, x, y);
  return segment ? { mode: "segment", ...segment } : { mode: "whole", dataIndex };
}

function drawScaledBarOverlay(chart: Chart, state: ReferralHoverMotion): void {
  const target = state.target;
  if (!target) return;
  const geometry = stackGeometry(chart, target.dataIndex);
  if (!geometry) return;
  const context = chart.ctx;

  if (state.wholeProgress > 0.001) {
    const scaleX = 1 + state.wholeProgress * 0.07;
    const scaleY = 1 + state.wholeProgress * 0.055;
    context.save();
    context.translate(geometry.x, geometry.base);
    context.scale(scaleX, scaleY);
    context.translate(-geometry.x, -geometry.base);
    for (const datasetIndex of visibleBarDatasetIndexes(chart)) {
      drawableBar(chart, datasetIndex, target.dataIndex)?.draw(context);
    }
    context.restore();
  }

  if (target.mode === "segment" && state.segmentProgress > 0.001) {
    const bar = drawableBar(chart, target.datasetIndex, target.dataIndex);
    if (!bar) return;
    context.save();
    context.translate(bar.x, 0);
    context.scale(1 + state.segmentProgress * 0.1, 1);
    context.translate(-bar.x, 0);
    bar.draw(context);
    context.restore();
  }
}

const referralTrackedItemsHoverPlugin: Plugin = {
  id: "referralTrackedItemsHover",
  afterEvent(chart, args) {
    const event = args.event;
    if (event.type === "mouseout" || event.x === null || event.y === null) {
      setReferralHoverTarget(chart, null);
      args.changed = true;
      return;
    }
    if (event.type !== "mousemove" && event.type !== "click") return;
    setReferralHoverTarget(chart, referralTargetAtPoint(chart, event.x, event.y));
    args.changed = true;
  },
  afterDatasetsDraw(chart) {
    const state = referralHoverMotion.get(chart);
    if (state) drawScaledBarOverlay(chart, state);
  },
  beforeDestroy(chart) {
    const state = referralHoverMotion.get(chart);
    if (state && state.frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.frame);
    }
    referralHoverMotion.delete(chart);
  },
};

export function installReferralTrackedItemsTooltipPositioner(
  positioners: Record<string, TooltipPositionerFunction<"bar">>,
): void {
  if (positioners.referralStackTop) return;
  positioners.referralStackTop = function referralStackTop(items) {
    const state = referralHoverMotion.get(this.chart);
    const dataIndex = state?.target?.dataIndex ?? items[0]?.index;
    if (dataIndex === undefined) return false;
    const geometry = stackGeometry(this.chart, dataIndex);
    if (!geometry) return false;
    return {
      x: geometry.x,
      y: Math.max(this.chart.chartArea.top + 6, geometry.top - 10),
      xAlign: "center",
      yAlign: "bottom",
    };
  };
}

export function focusReferralTrackedItemsMonth(chart: Chart, dataIndex: number): void {
  const maxIndex = Math.max(0, chart.data.labels?.length ? chart.data.labels.length - 1 : 0);
  setReferralHoverTarget(chart, {
    mode: "whole",
    dataIndex: Math.max(0, Math.min(maxIndex, dataIndex)),
  });
}

export function clearReferralTrackedItemsHover(chart: Chart): void {
  setReferralHoverTarget(chart, null);
}

export function referralTrackedItemsByWorkstreamChart(
  trends: ArdtsWorkstreamTrends,
  highlightMonth?: number,
): ChartConfiguration {
  const theme = resolveNk26ChartTheme();
  const chartData = buildTrackedItemsChartData(trends);
  const config = barBase(
    chartData.labels,
    chartData.datasets.map((dataset) => ({
      label: dataset.label,
      data: dataset.data,
      backgroundColor: dataset.color,
      hoverBackgroundColor: dataset.color,
      borderSkipped: false,
      stack: "workstreams",
    })),
    undefined,
    theme,
    highlightMonth,
  );

  return {
    ...config,
    plugins: [...(config.plugins ?? []), referralTrackedItemsHoverPlugin],
    options: {
      ...config.options,
      interaction: { mode: "nearest", intersect: true },
      plugins: {
        ...config.options?.plugins,
        legend: { display: false },
        tooltip: {
          mode: "nearest",
          intersect: true,
          position: "referralStackTop" as "nearest",
          callbacks: {
            label(item: TooltipItem<"bar">) {
              const state = referralHoverMotion.get(item.chart);
              if (state?.target?.mode === "whole") {
                return `All workstreams: ${chartData.totals[item.dataIndex] ?? 0}`;
              }
              const dataset = chartData.datasets[item.datasetIndex];
              return `${dataset?.label ?? item.dataset.label}: ${dataset?.data[item.dataIndex] ?? 0}`;
            },
          },
        },
      },
      scales: {
        x: {
          ...(config.options?.scales?.x as Record<string, unknown>),
          stacked: true,
        },
        y: {
          ...(config.options?.scales?.y as Record<string, unknown>),
          beginAtZero: true,
          stacked: true,
        },
      },
    },
  };
}

function expandedMonthTotals<T extends { month: number }>(months: T[], pick: (m: T) => number): number[] {
  const byIndex = new Map(months.map((m) => [chartMonthIndex(m.month), m]));
  return MONTHS.map((_, i) => {
    const row = byIndex.get(i);
    return row ? pick(row) : 0;
  });
}

export function referralSentExpandedChart(
  months: ArdtsMonthlySentPoint[],
  highlightMonth?: number,
): ChartConfiguration {
  const theme = resolveNk26ChartTheme();
  const accent = resolveNk26CssColor("--chart-this-year", "#2563eb");
  const totals = expandedMonthTotals(months, (m) => m.sent);
  const colors = emphasizeSelectedMonthBarColors(
    totals.map(() => accent),
    highlightMonth ?? -1,
  );

  return barBase(MONTHS, [{ label: "Referrals sent", data: totals, backgroundColor: colors }], undefined, theme, highlightMonth);
}

export function referralOutcomeMonthlyChart(
  months: ReferralMonthlyPoint[],
  highlightMonth?: number,
): ChartConfiguration {
  const theme = resolveNk26ChartTheme();
  const booked = monthTotals(months, (m) => m.booked);
  const backlog = monthTotals(months, (m) => m.booking_pending + m.need_help);

  return barBase(
    MONTHS,
    [
      {
        label: "Booked",
        data: booked,
        backgroundColor: emphasizeSelectedMonthBarColors(booked.map(() => "#22c55e"), highlightMonth ?? -1),
      },
      {
        label: "Needs action",
        data: backlog,
        backgroundColor: emphasizeSelectedMonthBarColors(backlog.map(() => "#f59e0b"), highlightMonth ?? -1),
      },
    ],
    undefined,
    theme,
    highlightMonth,
  );
}

export function referralOutcomeExpandedChart(
  months: ArdtsMonthlyOutcomePoint[],
  highlightMonth?: number,
): ChartConfiguration {
  const theme = resolveNk26ChartTheme();
  const booked = expandedMonthTotals(months, (m) => m.booked_or_beyond);
  const backlog = expandedMonthTotals(months, (m) => m.needs_action);

  return barBase(
    MONTHS,
    [
      {
        label: "Booked or beyond",
        data: booked,
        backgroundColor: emphasizeSelectedMonthBarColors(booked.map(() => "#22c55e"), highlightMonth ?? -1),
      },
      {
        label: "Needs action",
        data: backlog,
        backgroundColor: emphasizeSelectedMonthBarColors(backlog.map(() => "#f59e0b"), highlightMonth ?? -1),
      },
    ],
    undefined,
    theme,
    highlightMonth,
  );
}

export function referralStatusBreakdownChart(data: ArdtsStatusCountsResponse): ChartConfiguration {
  const theme = resolveNk26ChartTheme();
  const cards = REFERRAL_STATUS_CARDS.filter((c) => c.key !== "total");
  const labels = cards.map((c) => c.label);
  const values = cards.map((c) => data.counts[c.key as keyof typeof data.counts] ?? 0);
  const colors = cards.map((_, i) => STATUS_COLORS[i % STATUS_COLORS.length]!);

  const config = barBase(labels, [{ label: "Count", data: values, backgroundColor: colors }], undefined, theme);
  return {
    ...config,
    options: {
      ...config.options,
      indexAxis: "y",
      plugins: {
        ...config.options?.plugins,
        legend: { display: false },
      },
    },
  };
}

export function referralStatusBreakdownExpandedChart(cards: ArdtsStatusCard[]): ChartConfiguration {
  const theme = resolveNk26ChartTheme();
  const rows = cards.filter((card) => card.key !== "total");
  const labels = rows.map((card) => card.label);
  const values = rows.map((card) => card.count);
  const colors = rows.map((_, i) => STATUS_COLORS[i % STATUS_COLORS.length]!);

  const config = barBase(labels, [{ label: "Count", data: values, backgroundColor: colors }], undefined, theme);
  return {
    ...config,
    options: {
      ...config.options,
      indexAxis: "y",
      plugins: {
        ...config.options?.plugins,
        legend: { display: false },
      },
    },
  };
}
