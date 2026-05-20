import { NextResponse } from "next/server";
import { getAppDashboardSettings, updateAppDashboardSettings } from "@/lib/auth/app-settings";
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
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function PATCH(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageUsers(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    hide_legacy_nav?: unknown;
    use_nmac_test_data?: unknown;
    clear_nmac_month_cache?: unknown;
  };

  const input: {
    hideLegacyNav?: boolean;
    useNmacTestData?: boolean;
    bumpNmacMonthCacheRevision?: boolean;
  } = {};

  if (typeof body.hide_legacy_nav === "boolean") input.hideLegacyNav = body.hide_legacy_nav;
  if (typeof body.use_nmac_test_data === "boolean") input.useNmacTestData = body.use_nmac_test_data;
  if (body.clear_nmac_month_cache === true) input.bumpNmacMonthCacheRevision = true;

  if (
    input.hideLegacyNav === undefined &&
    input.useNmacTestData === undefined &&
    !input.bumpNmacMonthCacheRevision
  ) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const settings = await updateAppDashboardSettings(input);
  if (!settings) {
    return NextResponse.json({ error: "Could not save settings." }, { status: 500 });
  }

  return NextResponse.json({ preferences: settings, canEdit: true });
}
