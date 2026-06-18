import { findCustomRole, isSystemRoleId, type CustomRole } from "@/lib/auth/custom-roles";

export const APP_ROLES = ["viewer", "editor", "admin", "dev"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
  dev: "Developer",
};

export function formatRoleLabel(
  role: string | null | undefined,
  customRoles: CustomRole[] = [],
): string {
  if (!role) return "";
  if (isSystemRoleId(role)) return ROLE_LABELS[role];
  return findCustomRole(role, customRoles)?.label ?? role.replace(/_/g, " ");
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

export function isValidUserRole(value: unknown, customRoles: CustomRole[] = []): value is string {
  return typeof value === "string" && (isAppRole(value) || customRoles.some((role) => role.id === value));
}

export function canEditKpiData(
  role: string | null | undefined,
  customRoles: CustomRole[] = [],
): boolean {
  if (!role) return false;
  if (role === "editor" || role === "admin" || role === "dev") return true;
  const custom = findCustomRole(role, customRoles);
  if (custom) return custom.canEditKpiData;
  return false;
}

export function canManageUsers(role: string | null | undefined): boolean {
  return role === "admin" || role === "dev";
}

export function canAccessDev(role: string | null | undefined): boolean {
  return role === "dev";
}

export function canBypassMaintenance(role: string | null | undefined): boolean {
  return role === "admin" || role === "dev";
}

export function canManageDevRole(role: string | null | undefined): boolean {
  return role === "dev";
}

export function assignableRoles(
  actorRole: string | null | undefined,
  customRoles: CustomRole[] = [],
  targetRole?: string | null,
): string[] {
  const customIds = customRoles.map((role) => role.id);
  if (canManageDevRole(actorRole)) return [...APP_ROLES, ...customIds];
  if (targetRole === "dev") return ["dev"];
  return ["viewer", "editor", "admin", ...customIds];
}

export function devRoleChangeError(
  actorRole: string | null | undefined,
  targetRole: string,
  nextRole?: string,
): string | null {
  if (canManageDevRole(actorRole)) return null;
  if (nextRole === undefined) return null;
  if (targetRole === "dev" && nextRole !== targetRole) {
    return "Only a Developer can change a Developer user's role.";
  }
  if (nextRole === "dev") return "Only a Developer can assign the Developer role.";
  return null;
}
