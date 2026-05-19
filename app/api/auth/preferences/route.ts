import { NextResponse } from "next/server";
import {
  getUserDashboardPreferences,
  updateUserDashboardPreferences,
} from "@/lib/auth/user-preferences";
import { getSessionFromCookies } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefs = await getUserDashboardPreferences(session.sub);
  if (!prefs) {
    return NextResponse.json({ error: "Could not load preferences." }, { status: 500 });
  }

  return NextResponse.json(
    { preferences: prefs },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function PATCH(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const prefs = await updateUserDashboardPreferences(session.sub, input);
  if (!prefs) {
    return NextResponse.json({ error: "Could not save preferences." }, { status: 500 });
  }

  return NextResponse.json({ preferences: prefs });
}
