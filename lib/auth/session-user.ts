import { getSessionFromCookies } from "@/lib/auth/session";
import type { AppRole } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type SessionUser = {
  email: string;
  role: AppRole;
  firstName: string | null;
  lastName: string | null;
};

/** Full profile from DB (names + role). Use for layout and /api/auth/session. */
export async function getSessionUserForClient(): Promise<SessionUser | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("app_users")
      .select("email,role,first_name,last_name")
      .eq("id", session.sub)
      .maybeSingle();
    if (error || !data) return null;
    return {
      email: data.email as string,
      role: data.role as AppRole,
      firstName: (data.first_name as string | null) ?? null,
      lastName: (data.last_name as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
