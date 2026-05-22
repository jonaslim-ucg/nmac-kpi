"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DOMAINS_ORDER, KPIs, type KpiRow } from "@/lib/kpi-nmac-2026/model";

type Props = {
  targets: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  disabled?: boolean;
  /** Values to compare against for “Edited” styling (e.g. FY effective when editing a single month). */
  baselineTargets?: Record<string, number>;
  /** Label for the baseline line under each KPI. */
  baselineLabel?: string;
};

function matchesQuery(k: KpiRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return k.label.toLowerCase().includes(s) || k.id.toLowerCase().includes(s) || k.domain.toLowerCase().includes(s);
}

/** Grouped editors for NMAC master target overrides (full map including defaults). */
export function NmacTargetsForm({ targets, onChange, disabled, baselineTargets, baselineLabel }: Props) {
  const [query, setQuery] = useState("");
  /** Lets users clear the field while typing; default is restored on blur when still empty. */
  const [editing, setEditing] = useState<Record<string, string>>({});

  const baseline = useMemo(() => {
    if (baselineTargets) return baselineTargets;
    return Object.fromEntries(KPIs.map((k) => [k.id, k.target])) as Record<string, number>;
  }, [baselineTargets]);

  const blLabel = baselineLabel ?? "App default";

  const byDomain = useMemo(() => {
    const m: Record<string, KpiRow[]> = {};
    DOMAINS_ORDER.forEach((d) => {
      m[d] = [];
    });
    KPIs.forEach((k) => {
      if (m[k.domain]) m[k.domain].push(k);
    });
    return m;
  }, []);

  function commitTarget(id: string, raw: string) {
    const v = raw.trim();
    const num = v === "" ? NaN : Number(v);
    const next = { ...targets };
    if (!Number.isFinite(num)) {
      const def = baseline[id] ?? KPIs.find((k) => k.id === id)?.target;
      if (def !== undefined) next[id] = def;
    } else {
      next[id] = num;
    }
    onChange(next);
  }

  function displayTarget(id: string, current: number): string {
    if (Object.prototype.hasOwnProperty.call(editing, id)) return editing[id];
    return String(current);
  }

  function handleTargetChange(id: string, raw: string) {
    setEditing((prev) => ({ ...prev, [id]: raw }));
    const v = raw.trim();
    if (v === "") return;
    const num = Number(v);
    if (Number.isFinite(num)) {
      onChange({ ...targets, [id]: num });
    }
  }

  function handleTargetBlur(id: string, current: number) {
    const raw = Object.prototype.hasOwnProperty.call(editing, id) ? editing[id] : String(current);
    commitTarget(id, raw);
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const unitLabel = (u: string) => (u === "" ? "count" : u);

  let totalVisible = 0;
  DOMAINS_ORDER.forEach((d) => {
    totalVisible += (byDomain[d] ?? []).filter((k) => matchesQuery(k, query)).length;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter KPIs by name or id…"
          disabled={disabled}
          className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none ring-offset-background transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-60"
          aria-label="Filter KPIs"
        />
      </div>

      {totalVisible === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          No KPIs match your filter. Clear the search box to see all {KPIs.length} metrics.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {DOMAINS_ORDER.map((domain) => {
            const rows = (byDomain[domain] ?? []).filter((k) => matchesQuery(k, query));
            if (!rows.length) return null;
            return (
              <details
                key={domain}
                className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm open:shadow-md"
                open={domain === "Operations" || query.trim().length > 0}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-accent-muted/30 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-accent-muted/50 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
                      aria-hidden
                    />
                    {domain}
                  </span>
                  <span className="text-xs font-normal tabular-nums text-muted-foreground">
                    {rows.length} KPI{rows.length === 1 ? "" : "s"}
                  </span>
                </summary>
                <div className="border-t border-border bg-card px-3 py-4 sm:px-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {rows.map((k) => {
                      const def = baseline[k.id] ?? k.target;
                      const current = targets[k.id] ?? def;
                      const changed = current !== def;
                      return (
                        <div
                          key={k.id}
                          className={
                            "flex flex-col gap-2 rounded-lg border px-3 py-3 transition " +
                            (changed
                              ? "border-amber-500/40 bg-amber-500/5"
                              : "border-border bg-background/80")
                          }
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium leading-snug text-foreground">{k.label}</p>
                              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                                {k.id}
                              </p>
                            </div>
                            {changed ? (
                              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                                Edited
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-end gap-2">
                            <label className="min-w-0 flex-1">
                              <span className="sr-only">Target for {k.label}</span>
                              <input
                                type="number"
                                step="any"
                                inputMode="decimal"
                                disabled={disabled}
                                value={displayTarget(k.id, current)}
                                onChange={(e) => handleTargetChange(k.id, e.target.value)}
                                onBlur={() => handleTargetBlur(k.id, current)}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base font-semibold tabular-nums leading-none text-foreground outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 disabled:opacity-60 sm:text-sm"
                              />
                            </label>
                            <span className="shrink-0 pb-2 text-xs font-medium text-muted-foreground">
                              {unitLabel(k.unit)}
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            {blLabel} <span className="tabular-nums font-medium text-foreground/80">{def}</span>
                            {k.gate ? " · Gate KPI" : ""}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
