export const APP_ROLES = ["viewer", "editor", "admin", "dev"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

export function canEditKpiData(role: AppRole | null | undefined): boolean {
  return role === "editor" || role === "admin";
}

export function canManageUsers(role: AppRole | null | undefined): boolean {
  return role === "admin";
}

export function canAccessDev(role: AppRole | null | undefined): boolean {
  return role === "dev";
}
