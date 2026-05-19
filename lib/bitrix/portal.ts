/**
 * Bitrix24 portal hostname validation (no protocol/path).
 */
export function normalizePortalDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

export function isValidBitrixPortalDomain(domain: string): boolean {
  const d = normalizePortalDomain(domain);
  if (!d || d.length > 253) return false;
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(d) && !/^[a-z0-9]+$/i.test(d)) return false;
  if (d.includes("..")) return false;
  return true;
}

/** If BITRIX_ALLOWED_PORTALS is set (comma-separated hostnames), domain must match one of them. */
export function isPortalAllowedByEnv(domain: string): boolean {
  const raw = process.env.BITRIX_ALLOWED_PORTALS?.trim();
  if (!raw) return true;
  const d = normalizePortalDomain(domain);
  const allowed = raw
    .split(",")
    .map((s) => normalizePortalDomain(s))
    .filter(Boolean);
  return allowed.includes(d);
}
