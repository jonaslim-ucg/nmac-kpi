"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { KpiDefinition, WeeklyRow } from "@/lib/kpi/types";
import { formatKpiValue } from "@/lib/kpi/data-source";

type Props = { kpi: KpiDefinition; rows: WeeklyRow[] };

export function KpiChart({ kpi, rows }: Props) {
  const data = rows.map((r) => ({
    week: r.weekLabel,
    thisYear: r.thisYear,
    lastYear: r.lastYear,
    target: kpi.target,
  }));

  const suffix = kpi.suffix || (kpi.unit === "percent" ? "%" : "");

  return (
    <div className="dashboard-card flex h-[340px] w-full min-w-0 flex-col p-4 sm:p-5">
      <span className="dashboard-card-accent" aria-hidden />
      <div className="min-h-0 flex-1 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--foreground)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              }}
              formatter={(value, name) => {
                if (value == null || name === "target") return [null, String(name)];
                if (typeof value !== "number") return [String(value), String(name)];
                return [formatKpiValue(value, kpi.unit) + suffix, String(name)];
              }}
            />
            <Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 12 }} />
            <ReferenceLine
              y={kpi.target}
              stroke="var(--chart-target)"
              strokeDasharray="4 4"
              label={{ value: "Target", fill: "var(--chart-target)", fontSize: 11 }}
            />
            <Line
              type="monotone"
              dataKey="thisYear"
              name="This year"
              stroke="var(--chart-this-year)"
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="lastYear"
              name="Last year"
              stroke="var(--chart-last-year)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
