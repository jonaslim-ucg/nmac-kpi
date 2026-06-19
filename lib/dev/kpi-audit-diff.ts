import { KPIs, type MonthDb, type NmacKpiMonthPoint } from "@/lib/kpi-nmac-2026/model";
import type { WeeklyRow } from "@/lib/kpi/types";

export type AuditChangeSet = {
  added: string[];
  changed: string[];
  removed: string[];
};

const KPI_LABELS = Object.fromEntries(KPIs.map((kpi) => [kpi.id, kpi.label])) as Record<string, string>;

const MAX_LINES = 30;

function kpiLabel(id: string): string {
  return KPI_LABELS[id] ?? id.replace(/_/g, " ");
}

function capLines(lines: string[]): { lines: string[]; truncated: number } {
  if (lines.length <= MAX_LINES) return { lines, truncated: 0 };
  return { lines: lines.slice(0, MAX_LINES), truncated: lines.length - MAX_LINES };
}

export function summarizeChangeSet(set: AuditChangeSet): string {
  const parts: string[] = [];
  if (set.added.length) parts.push(`${set.added.length} added`);
  if (set.changed.length) parts.push(`${set.changed.length} changed`);
  if (set.removed.length) parts.push(`${set.removed.length} removed`);
  return parts.join(", ") || "no field changes";
}

function formatNum(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return String(value);
}

function formatWeeklyParts(row: WeeklyRow): string[] {
  const parts: string[] = [];
  if (row.thisYear != null) parts.push(`This year: ${formatNum(row.thisYear)}`);
  if (row.lastYear != null) parts.push(`Last year: ${formatNum(row.lastYear)}`);
  return parts;
}

function formatPointParts(point?: NmacKpiMonthPoint): string[] {
  if (!point) return [];
  const parts: string[] = [];
  if (point.ty !== undefined) parts.push(`This year: ${formatNum(point.ty)}`);
  if (point.ly !== undefined) parts.push(`Last year: ${formatNum(point.ly)}`);
  return parts;
}

function pointIsEmpty(point?: NmacKpiMonthPoint): boolean {
  return !point || (point.ty === undefined && point.ly === undefined);
}

export function diffWeeklyRows(before: WeeklyRow[], after: WeeklyRow[]): AuditChangeSet {
  const beforeMap = new Map(before.map((row) => [row.weekIndex, row]));
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  for (const row of after) {
    const prev = beforeMap.get(row.weekIndex);
    const label = row.weekLabel || `Week ${row.weekIndex}`;
    const nextParts = formatWeeklyParts(row);

    if (!prev) {
      if (nextParts.length > 0) {
        added.push(`${label} — ${nextParts.join(", ")}`);
      }
      continue;
    }

    const prevParts = formatWeeklyParts(prev);
    const tyChanged = prev.thisYear !== row.thisYear;
    const lyChanged = prev.lastYear !== row.lastYear;

    if ((prev.thisYear != null && row.thisYear == null) || (prev.lastYear != null && row.lastYear == null)) {
      const cleared: string[] = [];
      if (prev.thisYear != null && row.thisYear == null) cleared.push(`This year: ${formatNum(prev.thisYear)} (cleared)`);
      if (prev.lastYear != null && row.lastYear == null) cleared.push(`Last year: ${formatNum(prev.lastYear)} (cleared)`);
      if (cleared.length) removed.push(`${label} — ${cleared.join(", ")}`);
    }

    if (tyChanged || lyChanged) {
      const bits: string[] = [];
      if (tyChanged && !(prev.thisYear != null && row.thisYear == null)) {
        bits.push(`This year: ${formatNum(prev.thisYear)} → ${formatNum(row.thisYear)}`);
      }
      if (lyChanged && !(prev.lastYear != null && row.lastYear == null)) {
        bits.push(`Last year: ${formatNum(prev.lastYear)} → ${formatNum(row.lastYear)}`);
      }
      if (bits.length) changed.push(`${label} — ${bits.join(", ")}`);
    } else if (prevParts.length === 0 && nextParts.length > 0) {
      added.push(`${label} — ${nextParts.join(", ")}`);
    }
  }

  return { added, changed, removed };
}

export function diffMonthDb(before: MonthDb, after: MonthDb): AuditChangeSet {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const id of keys) {
    const label = kpiLabel(id);
    const prev = before[id];
    const next = after[id];
    const prevEmpty = pointIsEmpty(prev);
    const nextEmpty = pointIsEmpty(next);

    if (prevEmpty && nextEmpty) continue;

    if (prevEmpty && !nextEmpty) {
      added.push(`${label} — ${formatPointParts(next).join(", ")}`);
      continue;
    }

    if (!prevEmpty && nextEmpty) {
      removed.push(`${label} — ${formatPointParts(prev).join(", ")}`);
      continue;
    }

    const tyChanged = prev?.ty !== next?.ty;
    const lyChanged = prev?.ly !== next?.ly;
    if (!tyChanged && !lyChanged) continue;

    const bits: string[] = [];
    if (tyChanged) bits.push(`This year: ${formatNum(prev?.ty)} → ${formatNum(next?.ty)}`);
    if (lyChanged) bits.push(`Last year: ${formatNum(prev?.ly)} → ${formatNum(next?.ly)}`);
    changed.push(`${label} — ${bits.join(", ")}`);
  }

  return { added, changed, removed };
}

export function diffNumberRecord(
  before: Record<string, number>,
  after: Record<string, number>,
  valueLabel = "Target",
): AuditChangeSet {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const id of keys) {
    const label = kpiLabel(id);
    const prev = before[id];
    const next = after[id];
    const hadPrev = prev !== undefined && Number.isFinite(prev);
    const hasNext = next !== undefined && Number.isFinite(next);

    if (!hadPrev && hasNext) {
      added.push(`${label} — ${valueLabel}: ${formatNum(next)}`);
      continue;
    }
    if (hadPrev && !hasNext) {
      removed.push(`${label} — ${valueLabel}: ${formatNum(prev)}`);
      continue;
    }
    if (hadPrev && hasNext && prev !== next) {
      changed.push(`${label} — ${valueLabel}: ${formatNum(prev)} → ${formatNum(next)}`);
    }
  }

  return { added, changed, removed };
}

export function removedNumberRecord(before: Record<string, number>, valueLabel = "Target"): AuditChangeSet {
  const removed = Object.entries(before).map(
    ([id, value]) => `${kpiLabel(id)} — ${valueLabel}: ${formatNum(value)}`,
  );
  return { added: [], changed: [], removed };
}

export type StoredAuditChanges = AuditChangeSet & {
  addedTruncated?: number;
  changedTruncated?: number;
  removedTruncated?: number;
};

export function packAuditChanges(set: AuditChangeSet): StoredAuditChanges {
  const added = capLines(set.added);
  const changed = capLines(set.changed);
  const removed = capLines(set.removed);
  return {
    added: added.lines,
    changed: changed.lines,
    removed: removed.lines,
    ...(added.truncated ? { addedTruncated: added.truncated } : {}),
    ...(changed.truncated ? { changedTruncated: changed.truncated } : {}),
    ...(removed.truncated ? { removedTruncated: removed.truncated } : {}),
  };
}

export function formatStoredAuditChanges(changes: StoredAuditChanges): ActivityDetailLines[] {
  const out: ActivityDetailLines[] = [];
  if (changes.added.length) {
    out.push({
      label: "Added",
      lines: changes.added,
      truncated: changes.addedTruncated,
    });
  }
  if (changes.changed.length) {
    out.push({
      label: "Changed",
      lines: changes.changed,
      truncated: changes.changedTruncated,
    });
  }
  if (changes.removed.length) {
    out.push({
      label: "Removed",
      lines: changes.removed,
      truncated: changes.removedTruncated,
    });
  }
  return out;
}

export type ActivityDetailLines = {
  label: string;
  lines: string[];
  truncated?: number;
};

export function isStoredAuditChanges(value: unknown): value is StoredAuditChanges {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return Array.isArray(row.added) || Array.isArray(row.changed) || Array.isArray(row.removed);
}
