export type CustomRole = {
  id: string;
  label: string;
  canEditKpiData: boolean;
};

export const SYSTEM_ROLE_IDS = ["viewer", "editor", "admin", "dev"] as const;
export type SystemRoleId = (typeof SYSTEM_ROLE_IDS)[number];

export type RoleSlug = string;

const RESERVED_ROLE_IDS = new Set<string>(SYSTEM_ROLE_IDS);

export function slugifyRoleLabel(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "role"
  );
}

export function isSystemRoleId(id: string): id is SystemRoleId {
  return (SYSTEM_ROLE_IDS as readonly string[]).includes(id);
}

export function normalizeCustomRoles(raw: unknown): CustomRole[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomRole[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const idRaw = typeof row.id === "string" ? row.id.trim() : slugifyRoleLabel(label);
    const id = slugifyRoleLabel(idRaw);
    if (!label || !id || RESERVED_ROLE_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label,
      canEditKpiData: row.canEditKpiData === true,
    });
  }

  return out;
}

export function isValidRoleId(id: string, customRoles: CustomRole[]): boolean {
  return isSystemRoleId(id) || customRoles.some((role) => role.id === id);
}

export function findCustomRole(id: string, customRoles: CustomRole[]): CustomRole | null {
  return customRoles.find((role) => role.id === id) ?? null;
}

export function uniqueCustomRoleId(label: string, customRoles: CustomRole[]): string {
  const base = slugifyRoleLabel(label);
  if (!RESERVED_ROLE_IDS.has(base) && !customRoles.some((role) => role.id === base)) {
    return base;
  }
  let n = 2;
  while (RESERVED_ROLE_IDS.has(`${base}_${n}`) || customRoles.some((role) => role.id === `${base}_${n}`)) {
    n += 1;
  }
  return `${base}_${n}`;
}

export function configurableNavRoleIds(customRoles: CustomRole[]): string[] {
  return ["viewer", "editor", ...customRoles.map((role) => role.id)];
}
