"use client";

import { Eye, EyeOff, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";
import { useSession } from "@/components/auth/session-provider";
import { canAccessDev } from "@/lib/auth/types";
import {
  DEFAULT_HIDDEN_NMAC_KPI_IDS,
  DOMAINS_ORDER,
  KPIs,
  type KpiRow,
} from "@/lib/kpi-nmac-2026/model";

type Feedback = { tone: "ok" | "err"; text: string } | null;

function matchesQuery(kpi: KpiRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    kpi.label.toLowerCase().includes(q) ||
    kpi.id.toLowerCase().includes(q) ||
    kpi.domain.toLowerCase().includes(q)
  );
}

function Toggle({
  checked,
  disabled,
  label,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 " +
        (checked ? "bg-accent" : "bg-muted-foreground/30")
      }
    >
      <span
        className={
          "pointer-events-none absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200 ease-out " +
          (checked ? "left-[calc(100%-1.625rem)]" : "left-0.5")
        }
        aria-hidden
      />
    </button>
  );
}

export function NmacKpiVisibilityPanel() {
  const { user, loading } = useSession();
  const { hiddenNmacKpiIds, setHiddenNmacKpiIds } = useDashboardPreferences();
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const hiddenSet = useMemo(() => new Set(hiddenNmacKpiIds), [hiddenNmacKpiIds]);

  const grouped = useMemo(() => {
    const out: Record<string, KpiRow[]> = {};
    DOMAINS_ORDER.forEach((domain) => {
      out[domain] = [];
    });
    KPIs.filter((kpi) => matchesQuery(kpi, query)).forEach((kpi) => {
      if (out[kpi.domain]) out[kpi.domain].push(kpi);
    });
    return out;
  }, [query]);

  const visibleCount = KPIs.length - hiddenNmacKpiIds.length;
  const filteredCount = Object.values(grouped).reduce((sum, rows) => sum + rows.length, 0);

  async function saveHidden(nextHidden: string[], savingLabel: string, savingKey: string) {
    if (!canAccessDev(user?.role)) return;
    setSavingId(savingKey);
    setFeedback(null);
    try {
      const ok = await setHiddenNmacKpiIds(nextHidden);
      if (!ok) {
        setFeedback({
          tone: "err",
          text: "Could not save KPI visibility. Run supabase/add-nmac-kpi-visibility.sql first.",
        });
        return;
      }
      setFeedback({ tone: "ok", text: savingLabel });
    } catch {
      setFeedback({
        tone: "err",
        text: "Could not save KPI visibility. Run supabase/add-nmac-kpi-visibility.sql first.",
      });
    } finally {
      setSavingId(null);
    }
  }

  async function toggleKpi(kpi: KpiRow) {
    const nextHidden = hiddenSet.has(kpi.id)
      ? hiddenNmacKpiIds.filter((id) => id !== kpi.id)
      : [...hiddenNmacKpiIds, kpi.id];
    await saveHidden(
      nextHidden,
      hiddenSet.has(kpi.id) ? `${kpi.label} is visible.` : `${kpi.label} is hidden.`,
      kpi.id,
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading KPI visibility…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            {visibleCount} visible · {hiddenNmacKpiIds.length} hidden
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Hidden KPIs stay in Supabase, but do not show on the dashboard, NMAC master targets, monthly actuals, or spreadsheet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={savingId !== null}
            onClick={() => void saveHidden([...DEFAULT_HIDDEN_NMAC_KPI_IDS], "Default hidden KPI list restored.", "defaults")}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent-muted/40 disabled:opacity-50"
          >
            Restore defaults
          </button>
          <button
            type="button"
            disabled={savingId !== null}
            onClick={() => void saveHidden([], "All KPIs are visible.", "show-all")}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent-muted/40 disabled:opacity-50"
          >
            Show all
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter KPIs…"
          className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none ring-offset-background transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
          aria-label="Filter KPI visibility list"
        />
      </div>

      {filteredCount === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          No KPIs match your filter.
        </p>
      ) : (
        <div className="flex max-h-[520px] flex-col gap-3 overflow-y-auto pr-1">
          {DOMAINS_ORDER.map((domain) => {
            const rows = grouped[domain] ?? [];
            if (!rows.length) return null;
            return (
              <section key={domain} className="rounded-lg border border-border bg-background/70">
                <div className="border-b border-border px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{domain}</p>
                </div>
                <div className="divide-y divide-border">
                  {rows.map((kpi) => {
                    const hidden = hiddenSet.has(kpi.id);
                    const saving = savingId === kpi.id;
                    return (
                      <div key={kpi.id} className="flex items-center justify-between gap-4 px-3 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {hidden ? (
                              <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            ) : (
                              <Eye className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                            )}
                            <p className="truncate text-sm font-medium text-foreground">{kpi.label}</p>
                          </div>
                          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            {kpi.id} · {hidden ? "Hidden" : "Visible"}
                          </p>
                        </div>
                        {saving ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                        ) : null}
                        <Toggle
                          checked={!hidden}
                          disabled={savingId !== null}
                          label={`${kpi.label}: ${hidden ? "hidden" : "visible"}`}
                          onClick={() => void toggleKpi(kpi)}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {feedback ? (
        <p
          className={
            "text-xs " + (feedback.tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
          }
          role={feedback.tone === "err" ? "alert" : "status"}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
