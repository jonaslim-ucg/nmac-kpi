import { NextResponse } from "next/server";
import { auditAdminUserAdded } from "@/lib/dev/audit-log";
import { isValidEmailFormat } from "@/lib/auth/email-policy";
import { normalizePersonName } from "@/lib/auth/name-normalize";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canManageUsers, devRoleChangeError, isValidUserRole } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session || !canManageUsers(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,email,first_name,last_name,role,created_at,updated_at")
    .order("email", { ascending: true });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session || !canManageUsers(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = (await req.json()) as { email?: string; role?: string; first_name?: unknown; last_name?: unknown };
  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  const first_name = normalizePersonName(body.first_name);
  const last_name = normalizePersonName(body.last_name);

  if (!isValidEmailFormat(emailRaw)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  const settings = await getAppDashboardSettings();
  const customRoles = settings?.customRoles ?? [];
  if (!isValidUserRole(role, customRoles)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  const roleError = devRoleChangeError(session.role, "viewer", role);
  if (roleError) {
    return NextResponse.json({ error: roleError }, { status: 403 });
  }

  const email = emailRaw.toLowerCase();
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("app_users")
    .upsert(
      { email, role, first_name, last_name },
      { onConflict: "email" },
    )
    .select("id,email,first_name,last_name,role,created_at,updated_at")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not save user." }, { status: 500 });
  }

  await auditAdminUserAdded(
    { email: session.email, role: session.role },
    { email: data.email as string, role },
  );

  return NextResponse.json({ user: data });
}
