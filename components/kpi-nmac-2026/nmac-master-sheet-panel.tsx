"use client";

import { useMemo, useState } from "react";
import { Maximize2, Minimize2, Save, Search } from "lucide-react";
import {
  getLastYearVal,
  getVal,
  KPIs,
  MONTHS,
  VISIBLE_KPIS,
  type KpiRow,
  type MonthDb,
} from "@/lib/kpi-nmac-2026/model";
import "./nk26.css";

export type NmacMasterSheetDb = Record<number, MonthDb>;

type ValueMode = "ty" | "ly";

type SavePayload = {
  nextDb: NmacMasterSheetDb;
  dirtyMonths: number[];
  nextTargets: Record<string, number>;
  targetsDirty: boolean;
};

type Props = {
  db: NmacMasterSheetDb;
  targets: Record<string, number>;
  year: number;
  supportedYears: readonly number[];
  kpis?: readonly KpiRow[];
  onYearChange: (year: number) => void;
  onSave: (payload: SavePayload) => Promise<boolean | void> | boolean | void;
  saving?: boolean;
};

function matchesQuery(k: KpiRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return k.label.toLowerCase().includes(s) || k.id.toLowerCase().includes(s) || k.domain.toLowerCase().includes(s);
}

function draftKey(monthIndex: number, kpiId: string, mode: ValueMode) {
  return `${monthIndex}:${kpiId}:${mode}`;
}

function parseCell(raw: string): number | undefined {
  const v = raw.trim();
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pointHasValue(point: { ty?: number; ly?: number }) {
  return point.ty !== undefined || point.ly !== undefined;
}

export function NmacMasterSheetPanel({
  db,
  targets,
  year,
  supportedYears,
  kpis = VISIBLE_KPIS,
  onYearChange,
  onSave,
  saving = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ValueMode>("ty");
  const [fullscreen, setFullscreen] = useState(false);
  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>({});
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});
  const [toast, setToast] = useState(false);

  const rows = useMemo(() => kpis.filter((k) => matchesQuery(k, query)), [kpis, query]);
  const dirtyCellCount = Object.keys(cellDrafts).length;
  const dirtyTargetCount = Object.keys(targetDrafts).length;
  const dirty = dirtyCellCount + dirtyTargetCount > 0;
  const editingYear = mode === "ty" ? year : year - 1;

  const targetValue = (id: string, fallback: number) => {
    if (Object.prototype.hasOwnProperty.call(targetDrafts, id)) return targetDrafts[id];
    return String(targets[id] ?? fallback);
  };

  const cellValue = (monthIndex: number, id: string) => {
    const key = draftKey(monthIndex, id, mode);
    if (Object.prototype.hasOwnProperty.call(cellDrafts, key)) return cellDrafts[key];
    const v = mode === "ty" ? getVal(db, monthIndex, id) : getLastYearVal(db, monthIndex, id);
    return v === null ? "" : String(v);
  };

  function selectEditingYear(nextYear: number) {
    if (nextYear === year) {
      setMode("ty");
      return;
    }
    if (nextYear === year - 1) {
      setMode("ly");
      return;
    }
    setCellDrafts({});
    setTargetDrafts({});
    setMode("ty");
    onYearChange(nextYear);
  }

  async function saveSheet() {
    const nextDb: NmacMasterSheetDb = { ...db };
    const dirtyMonths = new Set<number>();

    for (const [key, raw] of Object.entries(cellDrafts)) {
      const [monthRaw, id, valueMode] = key.split(":") as [string, string, ValueMode];
      const monthIndex = Number(monthRaw);
      if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) continue;

      const month = { ...(nextDb[monthIndex] ?? {}) };
      const point = { ...(month[id] ?? {}) };
      const parsed = parseCell(raw);
      if (parsed === undefined) delete point[valueMode];
      else point[valueMode] = parsed;

      if (pointHasValue(point)) month[id] = point;
      else delete month[id];

      nextDb[monthIndex] = month;
      dirtyMonths.add(monthIndex);
    }

    const nextTargets = { ...targets };
    for (const [id, raw] of Object.entries(targetDrafts)) {
      const fallback = kpis.find((k) => k.id === id)?.target ?? KPIs.find((k) => k.id === id)?.target ?? 0;
      nextTargets[id] = parseCell(raw) ?? fallback;
    }

    const ok =
      (await Promise.resolve(
        onSave({
          nextDb,
          dirtyMonths: [...dirtyMonths].sort((a, b) => a - b),
          nextTargets,
          targetsDirty: Object.keys(targetDrafts).length > 0,
        }),
      )) !== false;

    if (!ok) return;
    setCellDrafts({});
    setTargetDrafts({});
    setToast(true);
    window.setTimeout(() => setToast(false), 2000);
  }

  return (
    <div className={"nk26-sheet" + (fullscreen ? " nk26-sheet-fullscreen" : "")}>
      <div className="nk26-sheet-toolbar">
        <div className="nk26-sheet-search">
          <Search className="nk26-sheet-search-icon" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter indicators…"
            disabled={saving}
            className="nk26-sheet-search-input"
            aria-label="Filter spreadsheet indicators"
          />
        </div>
        <label className="nk26-sheet-mode">
          <span>Editing</span>
          <select value={String(editingYear)} onChange={(e) => selectEditingYear(Number(e.target.value))} disabled={saving}>
            {supportedYears.map((optionYear) => (
              <option key={optionYear} value={optionYear}>
                {optionYear}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="nk26-btn nk26-btn-sec"
          onClick={() => setFullscreen((v) => !v)}
          aria-pressed={fullscreen}
        >
          {fullscreen ? (
            <Minimize2 className="nk26-btn-icon" aria-hidden />
          ) : (
            <Maximize2 className="nk26-btn-icon" aria-hidden />
          )}
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
        <button type="button" className="nk26-btn" onClick={() => void saveSheet()} disabled={saving || !dirty}>
          <Save className="nk26-btn-icon" aria-hidden />
          {saving ? "Saving..." : "Save sheet"}
        </button>
        <span className={"nk26-toast" + (toast ? " nk26-toast-show" : "")}>Saved</span>
      </div>

      <div className="nk26-sheet-meta">
        {dirty ? (
          <span>
            {dirtyCellCount} cell{dirtyCellCount === 1 ? "" : "s"}
            {dirtyTargetCount ? ` and ${dirtyTargetCount} target${dirtyTargetCount === 1 ? "" : "s"}` : ""} edited
          </span>
        ) : (
          <span>Synced with Monthly actuals. Targets save to {year}; month columns save values for {editingYear}.</span>
        )}
      </div>

      <div className="nk26-sheet-scroll">
        <table className="nk26-sheet-table">
          <thead>
            <tr>
              <th className="nk26-sheet-indicator">Indicator</th>
              <th className="nk26-sheet-target">Target</th>
              {MONTHS.map((month) => (
                <th key={month}>{month}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="nk26-sheet-empty" colSpan={14}>
                  No indicators match your filter.
                </td>
              </tr>
            ) : (
              rows.map((k) => (
                <tr key={k.id}>
                  <th className="nk26-sheet-indicator" scope="row">
                    <span className="nk26-sheet-label">{k.label}</span>
                    <span className="nk26-sheet-domain">{k.domain}</span>
                  </th>
                  <td className="nk26-sheet-target">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={targetValue(k.id, k.target)}
                      onChange={(e) => setTargetDrafts((prev) => ({ ...prev, [k.id]: e.target.value }))}
                      disabled={saving}
                      aria-label={`Target for ${k.label}`}
                    />
                  </td>
                  {MONTHS.map((month, monthIndex) => {
                    const key = draftKey(monthIndex, k.id, mode);
                    const edited = Object.prototype.hasOwnProperty.call(cellDrafts, key);
                    return (
                      <td key={month}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={cellValue(monthIndex, k.id)}
                          onChange={(e) =>
                            setCellDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          disabled={saving}
                          className={edited ? "nk26-sheet-edited" : undefined}
                          aria-label={`${month} ${editingYear} for ${k.label}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
