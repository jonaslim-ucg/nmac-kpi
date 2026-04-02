"use client";

import { formatRateCell, rateColumnHeader, type RateColumnMode } from "@/lib/kpi/rate";
import type { KpiDefinition, WeeklyRow } from "@/lib/kpi/types";
import { formatKpiValue } from "@/lib/kpi/data-source";

type Props = { kpi: KpiDefinition; rows: WeeklyRow[]; rateColumn: RateColumnMode };

export function KpiDataTable({ kpi, rows, rateColumn }: Props) {
  const suffix = kpi.suffix || (kpi.unit === "percent" ? "%" : "");
  const rateHeader = rateColumnHeader(rateColumn);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-accent-muted/40">
            <th className="px-4 py-3 font-medium text-muted-foreground">Week</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">This year</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Last year</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Target</th>
            {rateHeader ? (
              <th
                className="max-w-[7rem] px-4 py-3 font-medium leading-tight text-muted-foreground"
                title={
                  rateColumn === "target_pct"
                    ? "This year as a percentage of the KPI target (100% = on target)."
                    : "Percent change compared to the same week last year."
                }
              >
                {rateHeader}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekIndex} className="border-b border-border/80 last:border-0">
              <td className="px-4 py-2.5 font-medium text-foreground">{r.weekLabel}</td>
              <td className="px-4 py-2.5 text-foreground/90">{formatKpiValue(r.thisYear, kpi.unit)}{suffix}</td>
              <td className="px-4 py-2.5 text-foreground/90">{formatKpiValue(r.lastYear, kpi.unit)}{suffix}</td>
              <td className="px-4 py-2.5 text-foreground/90">{formatKpiValue(kpi.target, kpi.unit)}{suffix}</td>
              {rateHeader ? (
                <td className="px-4 py-2.5 text-foreground/90 tabular-nums">{formatRateCell(rateColumn, kpi, r)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
