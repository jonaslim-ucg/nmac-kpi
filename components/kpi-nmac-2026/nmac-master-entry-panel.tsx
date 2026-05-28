"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import {
  DOMAINS_ORDER,
  getLastYearVal,
  getVal,
  KPIs,
  meetsTarget,
  MONTHS,
  type KpiRow,
  type MonthDb,
} from "@/lib/kpi-nmac-2026/model";
import { rateVsLastYearPct } from "@/lib/kpi/rate";
import "./nk26.css";

function matchesQuery(k: KpiRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return k.label.toLowerCase().includes(s) || k.id.toLowerCase().includes(s) || k.domain.toLowerCase().includes(s);
}

export type NmacMasterDb = Record<number, MonthDb>;

export function MonthTabs({
  selectedMonth,
  onSelect,
}: {
  selectedMonth: number;
  onSelect: (i: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>(".nk26-tab-active");
    active?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selectedMonth]);

  return (
    <div className="nk26-tabs" ref={scrollRef}>
      {MONTHS.map((m, i) => (
        <button
          key={m}
          type="button"
          className={"nk26-tab" + (i === selectedMonth ? " nk26-tab-active" : "")}
          onClick={() => onSelect(i)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export type NmacMasterEntryPanelProps = {
  db: NmacMasterDb;
  /** Return false to skip the inline “Saved” toast (e.g. parent shows an error snackbar). */
  onPersist: (next: NmacMasterDb, monthIndex: number) => boolean | void | Promise<boolean | void>;
  inputIdPrefix?: string;
  hero?: ReactNode;
  /** When true, disables actions while saving */
  saving?: boolean;
  initialSelectedMonth?: number;
  /** Effective KPI definitions (including any target overrides). Defaults to built-in `KPIs`. */
  kpis?: readonly KpiRow[];
  /** Fires when the user picks a different month tab (for parent state, e.g. month-specific targets). */
  onSelectedMonthChange?: (monthIndex: number) => void;
};

export function NmacMasterEntryPanel({
  db,
  onPersist,
  inputIdPrefix = "nk26-inp-",
  hero,
  saving = false,
  initialSelectedMonth,
  kpis = KPIs,
  onSelectedMonthChange,
}: NmacMasterEntryPanelProps) {
  const [selectedMonth, setSelectedMonth] = useState(() => initialSelectedMonth ?? new Date().getMonth());
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(false);
  const [formEpoch, setFormEpoch] = useState(0);

  const onInputTy = (id: string, raw: string) => {
    const k = kpis.find((x) => x.id === id)!;
    if (raw === "") return "";
    const vnum = Number(raw);
    return meetsTarget(k, vnum) ? "nk26-ok" : "nk26-warn";
  };

  const saveMonth = async () => {
    const m = selectedMonth;
    const next: NmacMasterDb = { ...db, [m]: { ...db[m] } };
    kpis.forEach((k) => {
      const elTy = document.getElementById(`${inputIdPrefix}${k.id}-ty`) as HTMLInputElement | null;
      const elLy = document.getElementById(`${inputIdPrefix}${k.id}-ly`) as HTMLInputElement | null;
      if (!elTy && !elLy) return;
      const tyRaw = elTy?.value?.trim() ?? "";
      const lyRaw = elLy?.value?.trim() ?? "";
      const point: { ty?: number; ly?: number } = {};
      if (tyRaw !== "" && !Number.isNaN(Number(tyRaw))) point.ty = Number(tyRaw);
      if (lyRaw !== "" && !Number.isNaN(Number(lyRaw))) point.ly = Number(lyRaw);
      if (Object.keys(point).length > 0) next[m][k.id] = point;
      else delete next[m][k.id];
    });
    const ok = (await Promise.resolve(onPersist(next, m))) !== false;
    setFormEpoch((e) => e + 1);
    if (ok) {
      setToast(true);
      window.setTimeout(() => setToast(false), 2000);
    }
  };

  const clearMonth = async () => {
    if (!window.confirm(`Clear all saved values for ${MONTHS[selectedMonth]}?`)) return;
    const next: NmacMasterDb = { ...db, [selectedMonth]: {} };
    const ok = (await Promise.resolve(onPersist(next, selectedMonth))) !== false;
    setFormEpoch((e) => e + 1);
    if (ok) {
      setToast(true);
      window.setTimeout(() => setToast(false), 2000);
    }
  };

  const entryFields = useMemo(() => {
    const m = selectedMonth;
    const visibleKpis = kpis.filter((k) => matchesQuery(k, query));
    const domainGroups: Record<string, KpiRow[]> = {};
    DOMAINS_ORDER.forEach((d) => {
      domainGroups[d] = [];
    });
    visibleKpis.forEach((k) => {
      if (domainGroups[k.domain]) domainGroups[k.domain].push(k);
    });

    const nodes: ReactNode[] = [];
    DOMAINS_ORDER.forEach((domain) => {
      const ks = domainGroups[domain];
      if (!ks.length) return;
      nodes.push(
        <div key={domain} className="nk26-domain">
          {domain}
        </div>,
      );
      ks.forEach((k) => {
        const ty = getVal(db, m, k.id);
        const ly = getLastYearVal(db, m, k.id);
        const dispTarget =
          k.unit === "$" ? "≥ $" + k.target.toLocaleString() : (k.higher ? "≥ " : "≤ ") + k.target + k.unit;
        const clsTy = ty !== null ? (meetsTarget(k, ty) ? "nk26-ok" : "nk26-warn") : "";
        const yoy = rateVsLastYearPct(ty, ly);
        nodes.push(
          <div key={k.id} className="nk26-igroup">
            <div className="nk26-igroup-title">{k.label}</div>
            <div className="nk26-target-hint">
              Target (this year): {dispTarget}
              {k.gate ? " 🔴 GATE" : ""}
            </div>
            <div className="nk26-tyly">
              <div className="nk26-tyly-cell">
                <label className="nk26-tyly-lbl" htmlFor={`${inputIdPrefix}${k.id}-ty`}>
                  This year
                </label>
                <input
                  id={`${inputIdPrefix}${k.id}-ty`}
                  type="number"
                  defaultValue={ty !== null ? String(ty) : ""}
                  className={clsTy}
                  placeholder="—"
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.className = onInputTy(k.id, el.value);
                  }}
                />
              </div>
              <div className="nk26-tyly-cell">
                <label className="nk26-tyly-lbl" htmlFor={`${inputIdPrefix}${k.id}-ly`}>
                  Last year
                </label>
                <input
                  id={`${inputIdPrefix}${k.id}-ly`}
                  type="number"
                  defaultValue={ly !== null ? String(ly) : ""}
                  className="nk26-ly-inp"
                  placeholder="—"
                />
              </div>
            </div>
            <div className="nk26-yoy-hint">% vs last year: {yoy}</div>
          </div>,
        );
      });
    });
    return nodes;
  }, [db, selectedMonth, inputIdPrefix, formEpoch, kpis, query]);

  const visibleCount = useMemo(() => kpis.filter((k) => matchesQuery(k, query)).length, [kpis, query]);

  return (
    <>
      {hero}
      <MonthTabs
        selectedMonth={selectedMonth}
        onSelect={(i) => {
          setSelectedMonth(i);
          onSelectedMonthChange?.(i);
        }}
      />
      <div className="nk26-entry-search">
        <Search className="nk26-entry-search-icon" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search KPIs by name…"
          disabled={saving}
          className="nk26-entry-search-input"
          aria-label="Search monthly actuals KPIs"
        />
      </div>
      {visibleCount === 0 ? (
        <p className="nk26-entry-search-empty">
          No KPIs match your search. Clear the box to see all {kpis.length} metrics.
        </p>
      ) : (
        <div className="nk26-igrid" key={`${selectedMonth}-${formEpoch}`}>
          {entryFields}
        </div>
      )}
      <div className="nk26-brow">
        <button type="button" className="nk26-btn" onClick={() => void saveMonth()} disabled={saving}>
          {saving ? "Saving…" : "💾 Save month"}
        </button>
        <button type="button" className="nk26-btn nk26-btn-sec" onClick={() => void clearMonth()} disabled={saving}>
          ✕ Clear month
        </button>
        <span className={"nk26-toast" + (toast ? " nk26-toast-show" : "")}>✓ Saved!</span>
      </div>
    </>
  );
}
