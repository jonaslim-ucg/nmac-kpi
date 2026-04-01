const MAX = 120;

export function normalizePersonName(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, MAX);
  return t.length > 0 ? t : null;
}
