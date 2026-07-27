import { NextResponse } from "next/server";
import { auditCustomRoleCreated, auditCustomRoleRemoved } from "@/lib/dev/audit-log";
import { getAppDashboardSettings, updateAppDashboardSettings } from "@/lib/auth/app-settings";
import {
  normalizeCustomRoles,
  uniqueCustomRoleId,
  type CustomRole,
} from "@/lib/auth/custom-roles";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session || !canManageUsers(session.role)) return unauthorized();

  const body = (await req.json()) as { label?: string; canEditKpiData?: boolean };
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (label.length < 2) {
    return NextResponse.json({ error: "Enter a role name with at least 2 characters." }, { status: 400 });
  }
  if (label.length > 64) {
    return NextResponse.json({ error: "Role name is too long." }, { status: 400 });
  }

  const settings = await getAppDashboardSettings();
  if (!settings) {
    return NextResponse.json({ error: "Could not load settings." }, { status: 500 });
  }

  const customRoles = [...settings.customRoles];
  const id = uniqueCustomRoleId(label, customRoles);
  const role: CustomRole = {
    id,
    label,
    canEditKpiData: body.canEditKpiData === true,
  };
  customRoles.push(role);

  const nextSettings = await updateAppDashboardSettings({ customRoles });
  if (!nextSettings) {
    return NextResponse.json({ error: "Could not create role." }, { status: 500 });
  }

  await auditCustomRoleCreated({ email: session.email, role: session.role }, { roleId: id, label });

  return NextResponse.json({ role, customRoles: nextSettings.customRoles });
}

export async function DELETE(req: Request) {
  const session = await getSessionFromCookies();
  if (!session || !canManageUsers(session.role)) return unauthorized();

  const url = new URL(req.url);
  const roleId = url.searchParams.get("id")?.trim() ?? "";
  if (!roleId) {
    return NextResponse.json({ error: "Role id is required." }, { status: 400 });
  }

  const settings = await getAppDashboardSettings();
  if (!settings) {
    return NextResponse.json({ error: "Could not load settings." }, { status: 500 });
  }

  const target = settings.customRoles.find((role) => role.id === roleId);
  if (!target) {
    return NextResponse.json({ error: "Role not found." }, { status: 404 });
  }

  const supabase = createServiceRoleClient();
  const { count } = await supabase
    .from("app_users")
    .select("*", { count: "exact", head: true })
    .eq("role", roleId);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "This role is still assigned to users. Change their roles first." },
      { status: 400 },
    );
  }

  const customRoles = settings.customRoles.filter((role) => role.id !== roleId);
  const roleNmacNav = { ...settings.roleNmacNav };
  delete roleNmacNav[roleId];

  const nextSettings = await updateAppDashboardSettings({ customRoles, roleNmacNav });
  if (!nextSettings) {
    return NextResponse.json({ error: "Could not delete role." }, { status: 500 });
  }

  await auditCustomRoleRemoved({ email: session.email, role: session.role }, { roleId, label: target.label });

  return NextResponse.json({ customRoles: nextSettings.customRoles });
}
