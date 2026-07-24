import { DEFAULT_KPI_YEAR } from "@/lib/kpi/years";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const STORAGE_KEY_PREFIX = "nmac_kpi";
export const STORAGE_KEY = `${STORAGE_KEY_PREFIX}_${DEFAULT_KPI_YEAR}`;

/** Browser cache for NMAC target overrides (mirrors Supabase `nmac_master_targets`). */
export const TARGETS_STORAGE_KEY_PREFIX = "nmac_kpi_targets";
export const TARGETS_STORAGE_KEY = `${TARGETS_STORAGE_KEY_PREFIX}_${DEFAULT_KPI_YEAR}`;

/** FY / dataset year used with Supabase `nmac_master_monthly` and localStorage snapshot. */
export const NMAC_MASTER_DATA_YEAR = DEFAULT_KPI_YEAR;

export function nmacStorageKey(year = DEFAULT_KPI_YEAR) {
  return `${STORAGE_KEY_PREFIX}_${year}`;
}

export function nmacTargetsStorageKey(year = DEFAULT_KPI_YEAR) {
  return `${TARGETS_STORAGE_KEY_PREFIX}_${year}`;
}

export function defaultCompletedMonthIndex(date = new Date()): number {
  return (date.getMonth() + 11) % 12;
}

export function currentMonthIndex(date = new Date()): number {
  return date.getMonth();
}

/** Listed first in Performance overview “All KPIs” grid — stakeholder reporting priorities. */
export const OVERVIEW_PRIORITY_KPIS = ["satisfaction", "copay", "util", "feedback"] as const;

export type KpiRow = {
  id: string;
  label: string;
  unit: string;
  target: number;
  gate: boolean;
  domain: string;
  higher: boolean;
};

export const KPIs: KpiRow[] = [
  { id: "productivity", label: "Overall Clinic Productivity", unit: "%", target: 90, gate: true, domain: "Operations", higher: true },
  { id: "visits", label: "Patient Check-Outs", unit: "", target: 2220, gate: false, domain: "Volume", higher: true },
  { id: "annuals", label: "Annual / Physical Exams", unit: "", target: 150, gate: false, domain: "Volume", higher: true },
  { id: "exec", label: "Executive Annual Exams", unit: "", target: 50, gate: false, domain: "Volume", higher: true },
  { id: "wl", label: "Weight Loss Visit Compliance", unit: "%", target: 95, gate: true, domain: "Specialty", higher: true },
  { id: "util", label: "Doctor Utilisation", unit: "%", target: 90, gate: false, domain: "Scheduling", higher: true },
  { id: "noshow", label: "No-Show Rate", unit: "%", target: 7, gate: false, domain: "Scheduling", higher: false },
  { id: "callrate", label: "Telephone Calls Answered", unit: "%", target: 90, gate: false, domain: "Calls", higher: true },
  { id: "callvol", label: "Incoming Calls", unit: "", target: 300, gate: false, domain: "Calls", higher: true },
  { id: "call_answered", label: "Total Answered Calls", unit: "", target: 270, gate: false, domain: "Calls", higher: true },
  { id: "call_missed", label: "Total Missed/Abandoned Calls", unit: "", target: 30, gate: false, domain: "Calls", higher: false },
  { id: "copay", label: "Copay Collection Rate", unit: "%", target: 95, gate: false, domain: "Finance", higher: true },
  { id: "leakage", label: "Revenue Leakage", unit: "%", target: 10, gate: false, domain: "Finance", higher: false },
  { id: "eod", label: "EOD Variances", unit: "", target: 0, gate: false, domain: "Finance", higher: false },
  { id: "ph", label: "Total Population Health Visits", unit: "", target: 190, gate: false, domain: "Scheduling", higher: true },
  { id: "ai_confirmation_rate", label: "AI Confirmation Rate", unit: "%", target: 70, gate: false, domain: "Scheduling", higher: true },
  { id: "leads", label: "Lead-to-Booking Conversion", unit: "%", target: 75, gate: false, domain: "Scheduling", higher: true },
  { id: "checkin_checkout", label: "Avg. Check-In → Check-Out", unit: " min", target: 30, gate: false, domain: "Scheduling", higher: false },
  { id: "appt_confirm", label: "Appointment Confirmation Rate", unit: "%", target: 90, gate: false, domain: "Scheduling", higher: true },
  { id: "trich", label: "Trichology Schedule Productivity", unit: "%", target: 90, gate: true, domain: "Specialty", higher: true },
  { id: "ht", label: "Hair Transplant Session Productivity", unit: "%", target: 90, gate: true, domain: "Specialty", higher: true },
  { id: "fp", label: "Facial Plastics Bookings", unit: "", target: 20, gate: false, domain: "Specialty", higher: true },
  { id: "shop", label: "ShopNMAC Sales ($)", unit: "$", target: 3750, gate: false, domain: "Finance", higher: true },
  { id: "satisfaction", label: "Ave Patient Satisfaction Score", unit: "", target: 85, gate: false, domain: "Compliance", higher: true },
  { id: "feedback", label: "% Patients Completing Feedback", unit: "%", target: 15, gate: false, domain: "Compliance", higher: true },
  { id: "survey", label: "Patient Survey Score", unit: "", target: 4.7, gate: false, domain: "Compliance", higher: true },
  { id: "sop", label: "SOP Compliance", unit: "%", target: 100, gate: false, domain: "Compliance", higher: true },
  { id: "engage", label: "Staff Engagement", unit: "%", target: 80, gate: false, domain: "Compliance", higher: true },
  { id: "revenue", label: "Billed Revenue (Run-Rate)", unit: "$", target: 658333, gate: false, domain: "Finance", higher: true },
  { id: "net_margin", label: "Net Income Margin", unit: "%", target: 15, gate: false, domain: "Finance", higher: true },
  { id: "revenue_trend", label: "Revenue Trend vs. Prev Month", unit: "%", target: 0, gate: false, domain: "Finance", higher: true },
  { id: "bp_24hr", label: "24Hr Blood Pressure", unit: "", target: 25, gate: false, domain: "Nursing", higher: true },
  { id: "ecg", label: "ECG / EKG Completed", unit: "", target: 180, gate: false, domain: "Nursing", higher: true },
  { id: "random_sugars", label: "Random Blood Sugars", unit: "", target: 200, gate: false, domain: "Nursing", higher: true },
  { id: "spiro", label: "Spirometry Tests", unit: "", target: 20, gate: false, domain: "Nursing", higher: true },
  { id: "rn_visits", label: "RN Visits (CPT 99211)", unit: "", target: 58, gate: false, domain: "Nursing", higher: true },
];

/** Default developer-controlled KPI visibility for new installs. */
export const DEFAULT_HIDDEN_NMAC_KPI_IDS = [
  "call_answered",
  "call_missed",
  "leakage",
  "eod",
  "checkin_checkout",
  "appt_confirm",
  "sop",
  "engage",
  "revenue",
  "net_margin",
  "revenue_trend",
] as const;

/** KPIs kept out of reporting until their definitions and data sources are confirmed. */
export const TEMPORARILY_HIDDEN_NMAC_KPI_IDS = ["leakage", "eod"] as const;

export const DEVELOPER_HIDDEN_KPI_IDS = DEFAULT_HIDDEN_NMAC_KPI_IDS;

const KPI_ID_SET = new Set(KPIs.map((kpi) => kpi.id));

export function normalizeHiddenNmacKpiIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_HIDDEN_NMAC_KPI_IDS];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    if (!KPI_ID_SET.has(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  for (const id of TEMPORARILY_HIDDEN_NMAC_KPI_IDS) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function hiddenKpiSet(hiddenIds: readonly string[] = DEFAULT_HIDDEN_NMAC_KPI_IDS): Set<string> {
  return new Set([...hiddenIds, ...TEMPORARILY_HIDDEN_NMAC_KPI_IDS]);
}

export function isNmacKpiVisible(id: string, hiddenIds: readonly string[] = DEFAULT_HIDDEN_NMAC_KPI_IDS): boolean {
  return !hiddenKpiSet(hiddenIds).has(id);
}

export function visibleKpis(
  kpis: readonly KpiRow[] = KPIs,
  hiddenIds: readonly string[] = DEFAULT_HIDDEN_NMAC_KPI_IDS,
): KpiRow[] {
  const hidden = hiddenKpiSet(hiddenIds);
  return kpis.filter((kpi) => !hidden.has(kpi.id));
}

export const VISIBLE_KPIS = visibleKpis();

function normalizeTargetMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

function normalizeTargetByMonth(raw: unknown): Partial<Record<number, Record<string, number>>> {
  const out: Partial<Record<number, Record<string, number>>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, v] of Object.entries(raw)) {
    const m = Number(key);
    if (!Number.isInteger(m) || m < 0 || m > 11) continue;
    out[m] = normalizeTargetMap(v);
  }
  return out;
}

/** Full id → target map: built-in defaults merged with server FY overrides. */
export function mergeDefaultTargets(server: Record<string, number>): Record<string, number> {
  const base = Object.fromEntries(KPIs.map((k) => [k.id, k.target])) as Record<string, number>;
  return { ...base, ...server };
}

export type NmacTargetPack = {
  /** FY row from `nmac_master_targets` (partial or full JSON map). */
  fy: Record<string, number>;
  /** Per-month rows from `nmac_master_target_months` (each value is partial overrides on top of FY). */
  byMonth: Partial<Record<number, Record<string, number>>>;
};

export function loadTargetPack(year = DEFAULT_KPI_YEAR): NmacTargetPack {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return { fy: {}, byMonth: {} };
  }
  try {
    const raw = localStorage.getItem(nmacTargetsStorageKey(year));
    if (!raw) return { fy: {}, byMonth: {} };
    const o = JSON.parse(raw) as unknown;
    if (o && typeof o === "object" && !Array.isArray(o) && "fy" in o) {
      const bag = o as { fy?: unknown; byMonth?: unknown };
      return { fy: normalizeTargetMap(bag.fy), byMonth: normalizeTargetByMonth(bag.byMonth) };
    }
    return { fy: normalizeTargetMap(o), byMonth: {} };
  } catch {
    return { fy: {}, byMonth: {} };
  }
}

export function saveTargetPack(pack: NmacTargetPack, year = DEFAULT_KPI_YEAR) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    localStorage.setItem(nmacTargetsStorageKey(year), JSON.stringify(pack));
  } catch {
    /* ignore */
  }
}

/** Legacy: FY overrides only (for callers that predate per-month targets). */
export function loadTargetOverrides(year = DEFAULT_KPI_YEAR): Record<string, number> {
  return loadTargetPack(year).fy;
}

/** Persists FY overrides and keeps any cached per-month overrides intact. */
export function saveTargetOverrides(m: Record<string, number>, year = DEFAULT_KPI_YEAR) {
  const prev = loadTargetPack(year);
  saveTargetPack({ ...prev, fy: m }, year);
}

/** Resolved KPI rows for each calendar month (FY + optional month patch). */
export function buildKpisPerMonth(
  fyPartial: Record<string, number>,
  byMonth: Partial<Record<number, Record<string, number>>>,
  hiddenIds: readonly string[] = DEFAULT_HIDDEN_NMAC_KPI_IDS,
): KpiRow[][] {
  return MONTHS.map((_, m) =>
    visibleKpis(resolveKpisWithTargets(mergeDefaultTargets({ ...fyPartial, ...byMonth[m] })), hiddenIds),
  );
}

/** Month-only deltas vs FY-effective targets (for `nmac_master_target_months`). */
export function diffTargetsVsFy(fyPartial: Record<string, number>, draft: Record<string, number>): Record<string, number> {
  const fyEff = mergeDefaultTargets(fyPartial);
  const out: Record<string, number> = {};
  for (const k of KPIs) {
    if (draft[k.id] !== fyEff[k.id]) out[k.id] = draft[k.id];
  }
  return out;
}

/** Merge optional per-id targets into a full KPI row list for charts and forms. */
export function resolveKpisWithTargets(overrides: Partial<Record<string, number>> | null | undefined): KpiRow[] {
  if (!overrides) return KPIs;
  return KPIs.map((k) => {
    const v = overrides[k.id];
    if (v === undefined || !Number.isFinite(Number(v))) return k;
    return { ...k, target: Number(v) };
  });
}

export const DOMAINS_ORDER = [
  "Operations",
  "Volume",
  "Scheduling",
  "Calls",
  "Finance",
  "Specialty",
  "Nursing",
  "Compliance",
] as const;

export type NmacKpiMonthPoint = {
  /** Current reporting year (month) actual */
  ty?: number;
  /** Same calendar month, prior year actual */
  ly?: number;
};

export type MonthDb = Record<string, NmacKpiMonthPoint>;

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeKpiPoint(raw: unknown): NmacKpiMonthPoint {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === "number") return Number.isFinite(raw) ? { ty: raw } : {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const ty = num(o.ty ?? o.thisYear);
    const ly = num(o.ly ?? o.lastYear);
    const out: NmacKpiMonthPoint = {};
    if (ty !== undefined) out.ty = ty;
    if (ly !== undefined) out.ly = ly;
    return out;
  }
  return {};
}

function migrateLegacyMonth(raw: Record<string, unknown>): MonthDb {
  const out: MonthDb = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = normalizeKpiPoint(v);
  }
  return out;
}

export function monthDbHasValues(m: MonthDb): boolean {
  return Object.values(m).some((p) => p.ty !== undefined || p.ly !== undefined);
}

export function emptyNmacMonthDbs(): Record<number, MonthDb> {
  return Object.fromEntries(Array.from({ length: 12 }, (_, m) => [m, {}])) as Record<number, MonthDb>;
}

export function loadData(year = DEFAULT_KPI_YEAR): Record<number, MonthDb> {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return emptyNmacMonthDbs();
  }
  try {
    const raw = localStorage.getItem(nmacStorageKey(year));
    const parsed = raw ? (JSON.parse(raw) as Record<string, Record<string, unknown>>) : {};
    const out: Record<number, MonthDb> = {};
    for (let m = 0; m < 12; m++) {
      const mo = parsed[String(m)];
      out[m] = mo && typeof mo === "object" ? migrateLegacyMonth(mo) : {};
    }
    return out;
  } catch {
    return emptyNmacMonthDbs();
  }
}

export function saveAll(d: Record<number, MonthDb>, year = DEFAULT_KPI_YEAR) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    localStorage.setItem(nmacStorageKey(year), JSON.stringify(d));
  } catch {
    /* quota / private mode */
  }
}

/** This-year actual for charts and targets (legacy single-value = ty). */
export function getVal(db: Record<number, MonthDb>, m: number, id: string): number | null {
  const ty = db[m]?.[id]?.ty;
  return ty !== undefined ? Number(ty) : null;
}

export function getLastYearVal(db: Record<number, MonthDb>, m: number, id: string): number | null {
  const ly = db[m]?.[id]?.ly;
  return ly !== undefined ? Number(ly) : null;
}

export function meetsTarget(kpi: KpiRow, val: number | null): boolean | null {
  if (val === null) return null;
  return kpi.higher ? val >= kpi.target : val <= kpi.target;
}

export function pct(kpi: KpiRow, val: number | null): number | null {
  if (val === null) return null;
  if (kpi.higher) return Math.min(100, Math.round((val / kpi.target) * 100));
  return kpi.target === 0 ? (val === 0 ? 100 : 0) : Math.min(100, Math.round(((kpi.target - val + kpi.target) / kpi.target) * 100));
}

export function statusColor(kpi: KpiRow, val: number | null): "gray" | "green" | "yellow" | "red" {
  const ok = meetsTarget(kpi, val);
  if (ok === null) return "gray";
  if (ok) return "green";
  const p = pct(kpi, val);
  return p !== null && p >= 85 ? "yellow" : "red";
}

export function formatVal(kpi: KpiRow, val: number | null): string {
  if (val === null) return "–";
  if (kpi.unit === "$") return "$" + val.toLocaleString();
  if (kpi.unit === "%") return val + "%";
  if (kpi.unit) return val.toLocaleString() + kpi.unit;
  return val.toLocaleString();
}

export function monthlyData(db: Record<number, MonthDb>, kpiId: string): (number | null)[] {
  return MONTHS.map((_, i) => getVal(db, i, kpiId));
}

export function colorBar(
  db: Record<number, MonthDb>,
  kpiId: string,
  target: number | readonly number[],
  higher: boolean,
): string[] {
  return monthlyData(db, kpiId).map((v, i) => {
    if (v === null) return "rgba(100,116,139,0.3)";
    const t = typeof target === "number" ? target : (target[i] ?? target[0] ?? 0);
    const ok = higher ? v >= t : v <= t;
    return ok ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)";
  });
}

type Seed = {
  id: string;
  base: number;
  variance: number;
  gate: boolean;
  higher: boolean;
  target: number;
};

const SEEDS: Seed[] = [
  { id: "productivity", base: 92, variance: 2, gate: true, higher: true, target: 90 },
  { id: "visits", base: 2310, variance: 100, gate: false, higher: true, target: 2220 },
  { id: "annuals", base: 158, variance: 12, gate: false, higher: true, target: 150 },
  { id: "exec", base: 54, variance: 8, gate: false, higher: true, target: 50 },
  { id: "wl", base: 96.5, variance: 1.2, gate: true, higher: true, target: 95 },
  { id: "util", base: 92, variance: 3, gate: false, higher: true, target: 90 },
  { id: "noshow", base: 5.8, variance: 1, gate: false, higher: false, target: 7 },
  { id: "callrate", base: 92, variance: 3, gate: false, higher: true, target: 90 },
  { id: "callvol", base: 345, variance: 35, gate: false, higher: true, target: 300 },
  { id: "call_answered", base: 318, variance: 30, gate: false, higher: true, target: 270 },
  { id: "call_missed", base: 27, variance: 8, gate: false, higher: false, target: 30 },
  { id: "copay", base: 96.5, variance: 1.5, gate: false, higher: true, target: 95 },
  { id: "leakage", base: 7.5, variance: 1.5, gate: false, higher: false, target: 10 },
  { id: "eod", base: 0, variance: 0, gate: false, higher: false, target: 0 },
  { id: "ph", base: 190, variance: 12, gate: false, higher: true, target: 180 },
  { id: "ai_confirmation_rate", base: 70, variance: 6, gate: false, higher: true, target: 70 },
  { id: "leads", base: 75, variance: 5, gate: false, higher: true, target: 70 },
  { id: "checkin_checkout", base: 28, variance: 4, gate: false, higher: false, target: 30 },
  { id: "appt_confirm", base: 91, variance: 3, gate: false, higher: true, target: 90 },
  { id: "trich", base: 92, variance: 2, gate: true, higher: true, target: 90 },
  { id: "ht", base: 92, variance: 2, gate: true, higher: true, target: 90 },
  { id: "fp", base: 23, variance: 4, gate: false, higher: true, target: 20 },
  { id: "shop", base: 4000, variance: 350, gate: false, higher: true, target: 3750 },
  { id: "satisfaction", base: 88, variance: 4, gate: false, higher: true, target: 85 },
  { id: "feedback", base: 6.2, variance: 1.2, gate: false, higher: true, target: 15 },
  { id: "survey", base: 4.78, variance: 0.08, gate: false, higher: true, target: 4.7 },
  { id: "sop", base: 100, variance: 0, gate: false, higher: true, target: 100 },
  { id: "engage", base: 83, variance: 3, gate: false, higher: true, target: 80 },
  { id: "revenue", base: 675000, variance: 22000, gate: false, higher: true, target: 658333 },
  { id: "net_margin", base: 16.2, variance: 1.5, gate: false, higher: true, target: 15 },
  { id: "revenue_trend", base: 2.5, variance: 4, gate: false, higher: true, target: 0 },
  { id: "bp_24hr", base: 25, variance: 8, gate: false, higher: true, target: 25 },
  { id: "ecg", base: 188, variance: 10, gate: false, higher: true, target: 180 },
  { id: "random_sugars", base: 240, variance: 45, gate: false, higher: true, target: 200 },
  { id: "spiro", base: 23, variance: 3, gate: false, higher: true, target: 20 },
  { id: "rn_visits", base: 61, variance: 6, gate: false, higher: true, target: 58 },
];

/** Optional demo seed when this browser has never saved NMAC master data. */
export function seedDemoIfEmpty(db: Record<number, MonthDb>): Record<number, MonthDb> {
  const hasAny = Object.values(db).some(monthDbHasValues);
  if (hasAny) return db;
  const currentMo = new Date().getMonth();
  const next: Record<number, MonthDb> = { ...db };
  for (let m = 0; m <= currentMo; m++) {
    next[m] = { ...next[m] };
    SEEDS.forEach((s) => {
      let ty = s.base + (Math.random() - 0.5) * s.variance * 2;
      if (s.gate) {
        if (s.higher) ty = Math.max(ty, s.target + 0.5);
        else ty = Math.min(ty, s.target - 0.1);
      }
      ty = parseFloat(ty.toFixed(1));
      const lyFactor = s.higher ? 0.88 + Math.random() * 0.1 : 1.02 + Math.random() * 0.08;
      const ly = parseFloat((ty * lyFactor).toFixed(1));
      next[m][s.id] = { ty, ly };
    });
  }
  saveAll(next);
  return next;
}
