import type { AppRole } from "@/lib/auth/types";
import { canManageUsers } from "@/lib/auth/types";
import {
  configurableNavRoleIds,
  isSystemRoleId,
  type CustomRole,
} from "@/lib/auth/custom-roles";
import { NK26_VIEWS, type Nk26View } from "@/lib/kpi-nmac-2026/views-meta";

export const SURVEY_RESULTS_NAV_VIEW_ID = "survey-results" as const;

export type NmacNavViewId = Nk26View | typeof SURVEY_RESULTS_NAV_VIEW_ID;

export const NMAC_NAV_VIEW_IDS: readonly NmacNavViewId[] = [...NK26_VIEWS, SURVEY_RESULTS_NAV_VIEW_ID];

export type RoleNmacNavAccess = Record<string, NmacNavViewId[]>;

export const NMAC_NAV_ITEMS: { id: NmacNavViewId; label: string; href: string }[] = [
  { id: "overview", label: "Performance overview", href: "/nmac-2026" },
  { id: "visits", label: "Patient check-outs", href: "/nmac-2026/visits" },
  { id: "scheduling", label: "Scheduling", href: "/nmac-2026/scheduling" },
  { id: "finance", label: "Finance & revenue", href: "/nmac-2026/finance" },
  { id: "calls", label: "Call performance", href: "/nmac-2026/calls" },
  { id: "nursing", label: "Nursing KPIs", href: "/nmac-2026/nursing" },
  { id: "specialty", label: "Specialty clinics", href: "/nmac-2026/specialty" },
  { id: "compliance", label: "Compliance & quality", href: "/nmac-2026/compliance" },
  { id: "referrals", label: "Referral KPI", href: "/nmac-2026/referrals" },
  { id: SURVEY_RESULTS_NAV_VIEW_ID, label: "Survey results", href: "/admin/appointment-reviews" },
];

export function nmacNavHrefToViewId(href: string): NmacNavViewId | null {
  if (href === "/admin/appointment-reviews" || href.startsWith("/admin/appointment-reviews/")) {
    return SURVEY_RESULTS_NAV_VIEW_ID;
  }
  if (href === "/nmac-2026" || href === "/nmac-2026/") return "overview";
  const match = href.match(/^\/nmac-2026\/([^/]+)$/);
  if (!match) return null;
  const segment = match[1]!;
  return NMAC_NAV_VIEW_IDS.includes(segment as NmacNavViewId) ? (segment as NmacNavViewId) : null;
}

export function nmacNavViewIdToHref(id: NmacNavViewId): string {
  if (id === SURVEY_RESULTS_NAV_VIEW_ID) return "/admin/appointment-reviews";
  return id === "overview" ? "/nmac-2026" : `/nmac-2026/${id}`;
}

export function normalizeRoleNmacNavAccess(raw: unknown, customRoles: CustomRole[] = []): RoleNmacNavAccess {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const allowedRoleIds = new Set(configurableNavRoleIds(customRoles));
  const out: RoleNmacNavAccess = {};
  for (const roleId of allowedRoleIds) {
    const value = (raw as Record<string, unknown>)[roleId];
    if (!Array.isArray(value)) continue;
    const ids = value.filter(
      (id): id is NmacNavViewId => typeof id === "string" && NMAC_NAV_VIEW_IDS.includes(id as NmacNavViewId),
    );
    if (ids.length > 0) out[roleId] = [...new Set(ids)];
  }
  return out;
}

/** Returns allowed view ids, or null when the role has full access (no restriction configured). */
export function getRoleNmacNavAllowList(
  role: string | null | undefined,
  access: RoleNmacNavAccess,
): NmacNavViewId[] | null {
  if (!role || canManageUsers(role)) return null;
  const list = access[role];
  if (!list || list.length === 0) return null;
  return list;
}

export function isNmacNavViewAllowed(
  role: string | null | undefined,
  viewId: NmacNavViewId,
  access: RoleNmacNavAccess,
): boolean {
  const allowList = getRoleNmacNavAllowList(role, access);
  if (!allowList) return true;
  return allowList.includes(viewId);
}

export function isNmacNavHrefAllowed(
  role: string | null | undefined,
  href: string,
  access: RoleNmacNavAccess,
): boolean {
  const viewId = nmacNavHrefToViewId(href);
  if (!viewId) return true;
  return isNmacNavViewAllowed(role, viewId, access);
}

export function firstAllowedNmacNavHref(
  role: string | null | undefined,
  access: RoleNmacNavAccess,
): string {
  const allowList = getRoleNmacNavAllowList(role, access);
  if (!allowList) return "/nmac-2026";
  for (const item of NMAC_NAV_ITEMS) {
    if (allowList.includes(item.id)) return item.href;
  }
  return "/settings";
}

export function configurableRolesForNmacNav(customRoles: CustomRole[] = []): string[] {
  return configurableNavRoleIds(customRoles);
}

export function isConfigurableNavRole(roleId: string, customRoles: CustomRole[] = []): boolean {
  return configurableNavRoleIds(customRoles).includes(roleId);
}

export function isCustomNavRole(roleId: string, customRoles: CustomRole[] = []): boolean {
  return !isSystemRoleId(roleId) && customRoles.some((role) => role.id === roleId);
}

export type { AppRole };
