import { NextResponse } from "next/server";
import { auditAdminUserRemoved, auditAdminUserUpdated } from "@/lib/dev/audit-log";
import { isValidEmailFormat } from "@/lib/auth/email-policy";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";
import { getSessionFromCookies } from "@/lib/auth/session";
import { normalizePersonName } from "@/lib/auth/name-normalize";
import { canManageUsers, devRoleChangeError, isValidUserRole } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

async function countAdmins(supabase: ReturnType<typeof createServiceRoleClient>): Promise<number> {
  const { count } = await supabase.from("app_users").select("*", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getSessionFromCookies();
  if (!session || !canManageUsers(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await req.json()) as {
    role?: string;
    email?: string;
    first_name?: unknown;
    last_name?: unknown;
  };

  const supabase = createServiceRoleClient();
  const settings = await getAppDashboardSettings();
  const customRoles = settings?.customRoles ?? [];

  const { data: target } = await supabase
    .from("app_users")
    .select("id,role,email,first_name,last_name")
    .eq("id", id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.role !== undefined) {
    const role = typeof body.role === "string" ? body.role.trim() : "";
    if (!isValidUserRole(role, customRoles)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    const roleError = devRoleChangeError(session.role, target.role as string, role);
    if (roleError) {
      return NextResponse.json({ error: roleError }, { status: 403 });
    }
    if (session.sub === id && target.role === "admin" && role !== "admin") {
      if ((await countAdmins(supabase)) <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last admin. Promote another user first." },
          { status: 400 },
        );
      }
    }
    updates.role = role;
  }

  if ("first_name" in body) {
    updates.first_name = normalizePersonName(body.first_name);
  }
  if ("last_name" in body) {
    updates.last_name = normalizePersonName(body.last_name);
  }

  if (body.email !== undefined) {
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    if (!isValidEmailFormat(emailRaw)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }
    const email = emailRaw.toLowerCase();
    const { data: duplicate } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", email)
      .neq("id", id)
      .maybeSingle();
    if (duplicate) {
      return NextResponse.json({ error: "That email is already in the directory." }, { status: 400 });
    }
    updates.email = email;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("app_users")
    .update(updates)
    .eq("id", id)
    .select("id,email,first_name,last_name,role,created_at,updated_at")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not update user." }, { status: 500 });
  }

  const changes: Record<string, unknown> = {};
  if (updates.role !== undefined && updates.role !== target.role) {
    changes.role = { from: target.role, to: updates.role };
  }
  if (updates.email !== undefined && updates.email !== target.email) {
    changes.email = { from: target.email, to: updates.email };
  }
  if ("first_name" in updates && updates.first_name !== target.first_name) {
    changes.first_name = { from: target.first_name, to: updates.first_name };
  }
  if ("last_name" in updates && updates.last_name !== target.last_name) {
    changes.last_name = { from: target.last_name, to: updates.last_name };
  }
  if (Object.keys(changes).length > 0) {
    await auditAdminUserUpdated(
      { email: session.email, role: session.role },
      { email: (data.email as string) ?? (target.email as string), changes },
    );
  }

  return NextResponse.json({ user: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getSessionFromCookies();
  if (!session || !canManageUsers(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const supabase = createServiceRoleClient();

  const { data: target } = await supabase.from("app_users").select("id,role,email").eq("id", id).maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (session.sub === id) {
    return NextResponse.json(
      { error: "You cannot remove your own account. Ask another admin to do this." },
      { status: 400 },
    );
  }

  if (target.role === "admin") {
    if ((await countAdmins(supabase)) <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last admin. Promote another user first." },
        { status: 400 },
      );
    }
  }

  const email = (target.email as string).toLowerCase();
  await supabase.from("auth_otp_codes").delete().eq("email", email);

  const { error } = await supabase.from("app_users").delete().eq("id", id);
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not remove user." }, { status: 500 });
  }

  await auditAdminUserRemoved({ email: session.email, role: session.role }, { email });

  return NextResponse.json({ ok: true });
}
