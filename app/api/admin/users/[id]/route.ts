import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { normalizePersonName } from "@/lib/auth/name-normalize";
import type { AppRole } from "@/lib/auth/types";
import { canManageUsers } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getSessionFromCookies();
  if (!session || !canManageUsers(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await req.json()) as { role?: string; first_name?: unknown; last_name?: unknown };

  const supabase = createServiceRoleClient();

  const { data: target } = await supabase.from("app_users").select("id,role").eq("id", id).maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.role !== undefined) {
    const role = body.role as AppRole;
    if (role !== "viewer" && role !== "editor" && role !== "admin") {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    if (session.sub === id && target.role === "admin" && role !== "admin") {
      const { count } = await supabase.from("app_users").select("*", { count: "exact", head: true }).eq("role", "admin");
      if ((count ?? 0) <= 1) {
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

  return NextResponse.json({ user: data });
}
