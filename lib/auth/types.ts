export type AppRole = "viewer" | "editor" | "admin";

export function canEditKpiData(role: AppRole | null | undefined): boolean {
  return role === "editor" || role === "admin";
}

export function canManageUsers(role: AppRole | null | undefined): boolean {
  return role === "admin";
}
