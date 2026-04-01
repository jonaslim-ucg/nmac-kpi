import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { normalizePersonName } from "@/lib/auth/name-normalize";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function PATCH(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { first_name?: unknown; last_name?: unknown };
  const first_name = normalizePersonName(body.first_name);
  const last_name = normalizePersonName(body.last_name);

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_users")
    .update({
      first_name,
      last_name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.sub)
    .select("email,role,first_name,last_name")
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not update profile." }, { status: 500 });
  }

  return NextResponse.json({
    user: {
      email: data.email,
      role: data.role,
      firstName: data.first_name ?? null,
      lastName: data.last_name ?? null,
    },
  });
}
