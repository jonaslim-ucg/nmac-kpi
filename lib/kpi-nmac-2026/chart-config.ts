import type { ChartConfiguration } from "chart.js";
import { KPIs, MONTHS, getLastYearVal, getVal, monthlyData, type KpiRow, type MonthDb } from "@/lib/kpi-nmac-2026/model";
import { yoyDeltaNumeric } from "@/lib/kpi/rate";

/** Chart enter: values animate from baseline into place when a chart is created. */
const nk26ChartEnterMotion = {
  animation: {
    duration: 560,
    easing: "easeOutQuart" as const,
  },
  /** Avoid a second “animate in” when responsive resize runs after first layout. */
  transitions: {
    resize: { animation: { duration: 0 } },
  },
} as const;

/** Chart axis / legend colors resolved from `.nk26-root` theme tokens (falls back for SSR). */
export type Nk26ChartTheme = {
  gridColor: string;
  textColor: string;
  targetLineColor: string;
};

/** Chart.js: datasets sort by ascending `order`, then draw from last→first — smallest `order` paints on top. */

const CHART_FALLBACK: Nk26ChartTheme = {
  gridColor: "rgba(15, 23, 42, 0.08)",
  textColor: "#8b9cb5",
  targetLineColor: "rgba(100, 116, 139, 0.35)",
};

const DEFAULT_CHART_THIS_YEAR = "#2563eb";

/** Chart.js paints to canvas and does not resolve `var()` / `color-mix()` — use resolved RGBA fills. */
export function resolveNk26CssColor(varName: string, fallback = DEFAULT_CHART_THIS_YEAR): string {
  if (typeof document === "undefined") return fallback;
  const host = document.querySelector(".nk26-root") ?? document.documentElement;
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;left:-9999px;top:0;color:var(${varName});`;
  host.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  if (!c || c === "rgba(0, 0, 0, 0)") return fallback;
  return c;
}

function colorToRgba(color: string, alpha: number, fallbackRgb = "37, 99, 235"): string {
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/i.test(hex)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return `rgba(${fallbackRgb},${alpha})`;
}

/** Line + area fill for “this year” series (matches legend `--chart-this-year`). */
export function nk26ThisYearLineStyle(fillAlpha = 0.2): { borderColor: string; backgroundColor: string } {
  const borderColor = resolveNk26CssColor("--chart-this-year", DEFAULT_CHART_THIS_YEAR);
  return {
    borderColor,
    backgroundColor: colorToRgba(borderColor, fillAlpha),
  };
}

export function resolveNk26ChartTheme(): Nk26ChartTheme {
  if (typeof document === "undefined") return CHART_FALLBACK;
  const root = document.querySelector(".nk26-root");
  const el = root ?? document.documentElement;
  const s = getComputedStyle(el);
  const pick = (prop: string, fb: string) => {
    const v = s.getPropertyValue(prop).trim();
    return v || fb;
  };
  return {
    gridColor: pick("--nk26-chart-grid", CHART_FALLBACK.gridColor),
    textColor: pick("--nk26-chart-legend", CHART_FALLBACK.textColor),
    targetLineColor: pick("--nk26-chart-ref-line", CHART_FALLBACK.targetLineColor),
  };
}

export function lineBase(
  labels: readonly string[],
  datasets: Record<string, unknown>[],
  targetLine?: number | readonly number[],
  referenceLineLabel = "Target",
  theme: Nk26ChartTheme = resolveNk26ChartTheme(),
): ChartConfiguration {
  const allDatasets: Record<string, unknown>[] = datasets.map((d) => {
    const o = d as Record<string, unknown>;
    return {
      ...d,
      borderWidth: typeof o.borderWidth === "number" ? o.borderWidth : 2.5,
      pointRadius: typeof o.pointRadius === "number" ? o.pointRadius : 3,
      pointHoverRadius: typeof o.pointHoverRadius === "number" ? o.pointHoverRadius : 5,
      tension: typeof o.tension === "number" ? o.tension : 0.4,
      fill: typeof o.fill === "boolean" ? o.fill : false,
    };
  });
  if (targetLine !== undefined) {
    const lineData =
      typeof targetLine === "number"
        ? Array(labels.length).fill(targetLine)
        : [...targetLine].slice(0, labels.length);
    allDatasets.push({
      label: referenceLineLabel,
      data: lineData,
      borderColor: theme.targetLineColor,
      borderDash: [5, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      tension: 0,
    });
  }
  return {
    type: "line",
    data: { labels: [...labels], datasets: allDatasets as never },
    options: {
      ...nk26ChartEnterMotion,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: theme.textColor, font: { size: 12 }, boxWidth: 14 } } },
      scales: {
        x: { ticks: { color: theme.textColor, font: { size: 12 } }, grid: { color: theme.gridColor } },
        y: { ticks: { color: theme.textColor, font: { size: 12 } }, grid: { color: theme.gridColor } },
      },
    },
  };
}

export function barBase(
  labels: readonly string[],
  datasets: Record<string, unknown>[],
  targetLine?: number | readonly number[],
  theme: Nk26ChartTheme = resolveNk26ChartTheme(),
): ChartConfiguration {
  const allDatasets: Record<string, unknown>[] = datasets.map((d) => ({ ...d, borderWidth: 0, borderRadius: 4 }));
  if (targetLine !== undefined) {
    const lineData =
      typeof targetLine === "number"
        ? Array(labels.length).fill(targetLine)
        : [...targetLine].slice(0, labels.length);
    allDatasets.push({
      type: "line",
      label: "Target",
      data: lineData,
      borderColor: theme.targetLineColor,
      borderDash: [5, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0,
    });
  }
  return {
    type: "bar",
    data: { labels: [...labels], datasets: allDatasets as never },
    options: {
      ...nk26ChartEnterMotion,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: theme.textColor, font: { size: 12 }, boxWidth: 14 } } },
      scales: {
        x: { ticks: { color: theme.textColor, font: { size: 12 } }, grid: { color: theme.gridColor } },
        y: { ticks: { color: theme.textColor, font: { size: 12 } }, grid: { color: theme.gridColor } },
      },
    },
  };
}

export function findKpi(id: string, kpis: readonly KpiRow[] = KPIs): KpiRow {
  return kpis.find((x) => x.id === id) ?? KPIs.find((x) => x.id === id)!;
}

export function trendDatasets(db: Record<number, MonthDb>, kpis: readonly KpiRow[] = KPIs) {
  const keyKPIs = ["visits", "productivity", "callrate", "copay", "noshow", "util"] as const;
  const colors = ["#3b82f6", "#22c55e", "#06b6d4", "#f59e0b", "#ef4444", "#a78bfa"];
  return keyKPIs.map((id, i) => {
    const k = findKpi(id, kpis);
    return {
      label: k.label,
      data: MONTHS.map((_, mi) => yoyDeltaNumeric(getVal(db, mi, id), getLastYearVal(db, mi, id))),
      borderColor: colors[i],
      backgroundColor: colors[i] + "38",
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointBorderWidth: 2,
      pointBorderColor: "rgba(15, 23, 42, 0.35)",
    };
  });
}

export function utilNoshowConfig(
  db: Record<number, MonthDb>,
  kpisPerMonth: readonly (readonly KpiRow[])[],
  theme: Nk26ChartTheme = resolveNk26ChartTheme(),
): ChartConfiguration {
  const utilData = monthlyData(db, "util");
  const noshowData = monthlyData(db, "noshow");
  const utilLine = MONTHS.map((_, i) => findKpi("util", kpisPerMonth[i] ?? KPIs).target);
  const nsLine = MONTHS.map((_, i) => findKpi("noshow", kpisPerMonth[i] ?? KPIs).target);
  return {
    type: "bar",
    data: {
      labels: [...MONTHS],
      datasets: [
        {
          type: "bar",
          label: "Provider Utilization %",
          data: utilData,
          backgroundColor: "rgba(59,130,246,0.6)",
          yAxisID: "y",
          borderRadius: 4,
          order: 3,
        },
        {
          type: "line",
          label: "No-Show Rate %",
          data: noshowData,
          borderColor: "#ef4444",
          backgroundColor: "transparent",
          yAxisID: "y2",
          borderWidth: 2.5,
          tension: 0.4,
          pointRadius: 3,
          order: 0,
        },
        {
          type: "line",
          label: "Util target (by month)",
          data: utilLine,
          borderColor: "rgba(59,130,246,0.3)",
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          yAxisID: "y",
          order: 1,
        },
        {
          type: "line",
          label: "NS limit (by month)",
          data: nsLine,
          borderColor: "rgba(239,68,68,0.3)",
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          yAxisID: "y2",
          order: 2,
        },
      ] as never,
    },
    options: {
      ...nk26ChartEnterMotion,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: theme.textColor, font: { size: 12 }, boxWidth: 14 } } },
      scales: {
        x: { ticks: { color: theme.textColor, font: { size: 12 } }, grid: { color: theme.gridColor } },
        y: {
          type: "linear",
          position: "left",
          ticks: { color: theme.textColor, font: { size: 12 } },
          grid: { color: theme.gridColor },
          title: { display: true, text: "Utilization %", color: theme.textColor },
        },
        y2: {
          type: "linear",
          position: "right",
          ticks: { color: theme.textColor, font: { size: 12 } },
          grid: { drawOnChartArea: false },
          title: { display: true, text: "No-Show %", color: theme.textColor },
        },
      },
    },
  };
}

export function revenueChartConfig(
  db: Record<number, MonthDb>,
  colorBarFn: typeof import("@/lib/kpi-nmac-2026/model").colorBar,
  kpisPerMonth: readonly (readonly KpiRow[])[],
  theme: Nk26ChartTheme = resolveNk26ChartTheme(),
): ChartConfiguration {
  const revData = monthlyData(db, "revenue");
  const revTargets = MONTHS.map((_, i) => findKpi("revenue", kpisPerMonth[i] ?? KPIs).target);
  const ytd = revData.map((v, i) => {
    if (v === null) return null;
    let sum = 0;
    for (let j = 0; j <= i; j++) {
      if (revData[j] !== null) sum += revData[j]!;
    }
    return sum;
  });
  return {
    type: "bar",
    data: {
      labels: [...MONTHS],
      datasets: [
        {
          type: "bar",
          label: "Monthly Revenue",
          data: revData,
          backgroundColor: colorBarFn(db, "revenue", revTargets, true),
          borderRadius: 4,
          order: 3,
        },
        {
          type: "line",
          label: "YTD Revenue",
          data: ytd,
          borderColor: "#06b6d4",
          backgroundColor: "transparent",
          borderWidth: 2.5,
          tension: 0.4,
          pointRadius: 3,
          yAxisID: "y2",
          order: 0,
        },
        {
          type: "line",
          label: `Monthly target (~$${Math.round((revTargets.reduce((a, b) => a + b, 0) / revTargets.length) / 1000)}K avg)`,
          data: revTargets,
          borderColor: theme.targetLineColor,
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          order: 1,
        },
      ] as never,
    },
    options: {
      ...nk26ChartEnterMotion,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: theme.textColor, font: { size: 12 }, boxWidth: 14 } } },
      scales: {
        x: { ticks: { color: theme.textColor, font: { size: 12 } }, grid: { color: theme.gridColor } },
        y: {
          ticks: {
            color: theme.textColor,
            font: { size: 12 },
            callback: (v: string | number) => "$" + (Number(v) / 1000).toFixed(0) + "K",
          },
          grid: { color: theme.gridColor },
        },
        y2: {
          type: "linear",
          position: "right",
          ticks: {
            color: "#06b6d4",
            font: { size: 12 },
            callback: (v: string | number) => "$" + (Number(v) / 1000).toFixed(0) + "K",
          },
          grid: { drawOnChartArea: false },
        },
      },
    },
  };
}

export function rnVisitsBarConfig(
  db: Record<number, MonthDb>,
  kpisPerMonth: readonly (readonly KpiRow[])[],
  theme: Nk26ChartTheme = resolveNk26ChartTheme(),
): ChartConfiguration {
  const rnData = monthlyData(db, "rn_visits");
  const ytd = rnData.map((v, i) => {
    let sum = 0;
    for (let j = 0; j <= i; j++) {
      if (rnData[j] !== null) sum += rnData[j]!;
    }
    return sum || null;
  });
  const bg = ytd.map((v, i) => {
    if (v === null) return "rgba(100,116,139,0.3)";
    const rnK = findKpi("rn_visits", kpisPerMonth[i] ?? KPIs);
    const paceLo = Math.round(rnK.target * 10);
    const paceHi = Math.round(rnK.target * 12);
    return v >= paceHi
      ? "rgba(34,197,94,0.7)"
      : v >= paceLo
        ? "rgba(245,158,11,0.7)"
        : "rgba(59,130,246,0.6)";
  });
  const lineRef = MONTHS.map((_, i) => Math.round(findKpi("rn_visits", kpisPerMonth[i] ?? KPIs).target * 10));
  return barBase(
    MONTHS,
    [
      {
        label: "YTD RN Visits",
        data: ytd,
        backgroundColor: bg,
      },
    ],
    lineRef,
    theme,
  );
}
