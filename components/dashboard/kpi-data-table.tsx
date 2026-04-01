"use client";

import type { KpiDefinition, WeeklyRow } from "@/lib/kpi/types";
import { formatKpiValue } from "@/lib/kpi/data-source";

type Props = { kpi: KpiDefinition; rows: WeeklyRow[] };

export function KpiDataTable({ kpi, rows }: Props) {
  const suffix = kpi.suffix || (kpi.unit === "percent" ? "%" : "");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-accent-muted/40">
            <th className="px-4 py-3 font-medium text-muted-foreground">Week</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">This year</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Last year</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekIndex} className="border-b border-border/80 last:border-0">
              <td className="px-4 py-2.5 font-medium text-foreground">{r.weekLabel}</td>
              <td className="px-4 py-2.5 text-foreground/90">{formatKpiValue(r.thisYear, kpi.unit)}{suffix}</td>
              <td className="px-4 py-2.5 text-foreground/90">{formatKpiValue(r.lastYear, kpi.unit)}{suffix}</td>
              <td className="px-4 py-2.5 text-foreground/90">{formatKpiValue(kpi.target, kpi.unit)}{suffix}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
