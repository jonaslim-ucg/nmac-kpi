import type { AppRole } from "@/lib/auth/types";
import { canManageUsers } from "@/lib/auth/types";
import { NK26_VIEWS, type Nk26View } from "@/lib/kpi-nmac-2026/views-meta";

export type NmacNavViewId = Nk26View;

export const NMAC_NAV_VIEW_IDS: readonly NmacNavViewId[] = NK26_VIEWS;

export type RoleNmacNavAccess = Partial<Record<AppRole, NmacNavViewId[]>>;

export const NMAC_NAV_ITEMS: { id: NmacNavViewId; label: string; href: string }[] = [
  { id: "overview", label: "Performance overview", href: "/nmac-2026" },
  { id: "visits", label: "Visit volume", href: "/nmac-2026/visits" },
  { id: "scheduling", label: "Scheduling", href: "/nmac-2026/scheduling" },
  { id: "finance", label: "Finance & revenue", href: "/nmac-2026/finance" },
  { id: "calls", label: "Call performance", href: "/nmac-2026/calls" },
  { id: "nursing", label: "Nursing KPIs", href: "/nmac-2026/nursing" },
  { id: "specialty", label: "Specialty clinics", href: "/nmac-2026/specialty" },
  { id: "compliance", label: "Compliance & quality", href: "/nmac-2026/compliance" },
  { id: "referrals", label: "Referral KPI", href: "/nmac-2026/referrals" },
];

const CONFIGURABLE_ROLES: AppRole[] = ["viewer", "editor"];

export function nmacNavHrefToViewId(href: string): NmacNavViewId | null {
  if (href === "/nmac-2026" || href === "/nmac-2026/") return "overview";
  const match = href.match(/^\/nmac-2026\/([^/]+)$/);
  if (!match) return null;
  const segment = match[1]!;
  return NMAC_NAV_VIEW_IDS.includes(segment as NmacNavViewId) ? (segment as NmacNavViewId) : null;
}

export function nmacNavViewIdToHref(id: NmacNavViewId): string {
  return id === "overview" ? "/nmac-2026" : `/nmac-2026/${id}`;
}

export function normalizeRoleNmacNavAccess(raw: unknown): RoleNmacNavAccess {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: RoleNmacNavAccess = {};
  for (const role of CONFIGURABLE_ROLES) {
    const value = (raw as Record<string, unknown>)[role];
    if (!Array.isArray(value)) continue;
    const ids = value.filter(
      (id): id is NmacNavViewId => typeof id === "string" && NMAC_NAV_VIEW_IDS.includes(id as NmacNavViewId),
    );
    if (ids.length > 0) out[role] = [...new Set(ids)];
  }
  return out;
}

/** Returns allowed view ids, or null when the role has full access (no restriction configured). */
export function getRoleNmacNavAllowList(
  role: AppRole | null | undefined,
  access: RoleNmacNavAccess,
): NmacNavViewId[] | null {
  if (!role || canManageUsers(role)) return null;
  const list = access[role];
  if (!list || list.length === 0) return null;
  return list;
}

export function isNmacNavViewAllowed(
  role: AppRole | null | undefined,
  viewId: NmacNavViewId,
  access: RoleNmacNavAccess,
): boolean {
  const allowList = getRoleNmacNavAllowList(role, access);
  if (!allowList) return true;
  return allowList.includes(viewId);
}

export function isNmacNavHrefAllowed(
  role: AppRole | null | undefined,
  href: string,
  access: RoleNmacNavAccess,
): boolean {
  const viewId = nmacNavHrefToViewId(href);
  if (!viewId) return true;
  return isNmacNavViewAllowed(role, viewId, access);
}

export function firstAllowedNmacNavHref(
  role: AppRole | null | undefined,
  access: RoleNmacNavAccess,
): string {
  const allowList = getRoleNmacNavAllowList(role, access);
  if (!allowList) return "/nmac-2026";
  for (const item of NMAC_NAV_ITEMS) {
    if (allowList.includes(item.id)) return item.href;
  }
  return "/settings";
}

export function configurableRolesForNmacNav(): AppRole[] {
  return CONFIGURABLE_ROLES;
}
