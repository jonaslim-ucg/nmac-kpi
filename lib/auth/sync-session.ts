import { cookies } from "next/headers";
import type { SessionPayload } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";
import { buildSessionCookieOptions } from "@/lib/auth/session-cookie";
import type { AppRole } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** Align JWT role/email with `app_users` (e.g. after an admin promotion without re-login). */
export async function resolveSessionWithDatabase(
  session: SessionPayload,
): Promise<{ session: SessionPayload; refreshedToken?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("app_users")
      .select("email, role")
      .eq("id", session.sub)
      .maybeSingle();
    if (!data) return { session };

    const email = data.email as string;
    const role = data.role as AppRole;
    if (email === session.email && role === session.role) {
      return { session };
    }

    const refreshedToken = await signSessionToken({ sub: session.sub, email, role });
    return {
      session: { sub: session.sub, email, role },
      refreshedToken,
    };
  } catch {
    return { session };
  }
}

export async function persistRefreshedSessionToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, buildSessionCookieOptions());
}
