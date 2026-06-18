import { NextResponse } from "next/server";
import { auditRoleNmacNavUpdated } from "@/lib/dev/audit-log";
import { getAppDashboardSettings, updateAppDashboardSettings } from "@/lib/auth/app-settings";
import { configurableRolesForNmacNav, normalizeRoleNmacNavAccess } from "@/lib/auth/role-nmac-nav";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/auth/types";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getAppDashboardSettings();
  if (!settings) {
    return NextResponse.json({ error: "Could not load settings." }, { status: 500 });
  }

  const canEdit = canManageUsers(session.role);

  return NextResponse.json(
    {
      preferences: settings,
      canEdit,
      canClearCache: true,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function PATCH(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = canManageUsers(session.role);

  const body = (await req.json()) as {
    hide_legacy_nav?: unknown;
    use_nmac_test_data?: unknown;
    clear_nmac_month_cache?: unknown;
    role_nmac_nav?: unknown;
  };

  const wantsOrgToggle =
    typeof body.hide_legacy_nav === "boolean" || typeof body.use_nmac_test_data === "boolean";
  const wantsRoleNav = body.role_nmac_nav !== undefined;
  const wantsCacheClear = body.clear_nmac_month_cache === true;

  if ((wantsOrgToggle || wantsRoleNav) && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentSettings = wantsRoleNav ? await getAppDashboardSettings() : null;

  const input: {
    hideLegacyNav?: boolean;
    useNmacTestData?: boolean;
    bumpNmacMonthCacheRevision?: boolean;
    roleNmacNav?: ReturnType<typeof normalizeRoleNmacNavAccess>;
  } = {};

  if (typeof body.hide_legacy_nav === "boolean") input.hideLegacyNav = body.hide_legacy_nav;
  if (typeof body.use_nmac_test_data === "boolean") input.useNmacTestData = body.use_nmac_test_data;
  if (wantsRoleNav) {
    input.roleNmacNav = normalizeRoleNmacNavAccess(
      body.role_nmac_nav,
      currentSettings?.customRoles ?? [],
    );
  }
  if (wantsCacheClear) input.bumpNmacMonthCacheRevision = true;

  if (
    input.hideLegacyNav === undefined &&
    input.useNmacTestData === undefined &&
    input.roleNmacNav === undefined &&
    !input.bumpNmacMonthCacheRevision
  ) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const previousSettings = currentSettings;

  const settings = await updateAppDashboardSettings(input);
  if (!settings) {
    return NextResponse.json({ error: "Could not save settings." }, { status: 500 });
  }

  if (input.roleNmacNav !== undefined && previousSettings) {
    const changedRoles = configurableRolesForNmacNav(previousSettings.customRoles).filter((role) => {
      const before = JSON.stringify(previousSettings.roleNmacNav[role] ?? null);
      const after = JSON.stringify(settings.roleNmacNav[role] ?? null);
      return before !== after;
    });
    if (changedRoles.length > 0) {
      auditRoleNmacNavUpdated({ email: session.email, role: session.role }, { roles: changedRoles });
    }
  }

  return NextResponse.json({
    preferences: settings,
    canEdit: isAdmin,
    canClearCache: true,
  });
}
