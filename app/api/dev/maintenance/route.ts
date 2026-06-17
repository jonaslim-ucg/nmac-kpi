import { NextResponse } from "next/server";
import { auditMaintenanceModeUpdated } from "@/lib/dev/audit-log";
import { updateAppDashboardSettings, getAppDashboardSettings } from "@/lib/auth/app-settings";
import { clearMaintenanceModeEdgeCache } from "@/lib/auth/maintenance-mode";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessDev(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getAppDashboardSettings();
  if (!settings) {
    return NextResponse.json({ error: "Could not load settings." }, { status: 500 });
  }

  return NextResponse.json(
    { maintenanceMode: settings.maintenanceMode },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function PATCH(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessDev(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { maintenance_mode?: unknown };
  if (typeof body.maintenance_mode !== "boolean") {
    return NextResponse.json({ error: "maintenance_mode must be a boolean." }, { status: 400 });
  }

  const previous = await getAppDashboardSettings();
  const settings = await updateAppDashboardSettings({ maintenanceMode: body.maintenance_mode });
  if (!settings) {
    return NextResponse.json({ error: "Could not save maintenance mode." }, { status: 500 });
  }

  clearMaintenanceModeEdgeCache();

  if (previous && previous.maintenanceMode !== settings.maintenanceMode) {
    auditMaintenanceModeUpdated(
      { email: session.email, role: session.role },
      { enabled: settings.maintenanceMode },
    );
  }

  return NextResponse.json({ maintenanceMode: settings.maintenanceMode });
}
