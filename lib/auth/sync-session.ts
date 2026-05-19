import { cookies } from "next/headers";
import type { SessionPayload } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";
import { buildSessionCookieOptions } from "@/lib/auth/session-cookie";
import type { AppRole } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type SessionSyncResult =
  | { ok: true; session: SessionPayload; refreshedToken?: string }
  | { ok: false; revoked: true };

/** Align JWT with `app_users`, or revoke when the user was removed from the directory. */
export async function resolveSessionWithDatabase(
  session: SessionPayload,
): Promise<SessionSyncResult> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("app_users")
      .select("email, role")
      .eq("id", session.sub)
      .maybeSingle();

    if (!data) {
      return { ok: false, revoked: true };
    }

    const email = data.email as string;
    const role = data.role as AppRole;
    if (email === session.email && role === session.role) {
      return { ok: true, session };
    }

    const refreshedToken = await signSessionToken({ sub: session.sub, email, role });
    return {
      ok: true,
      session: { sub: session.sub, email, role },
      refreshedToken,
    };
  } catch {
    return { ok: true, session };
  }
}

export async function persistRefreshedSessionToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, buildSessionCookieOptions());
}

/** Clear session cookie in Route Handlers / Server Components. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const cleared = { ...buildSessionCookieOptions(), maxAge: 0 };
  const clearedEmbedded = { ...buildSessionCookieOptions(true), maxAge: 0 };
  store.set(SESSION_COOKIE_NAME, "", cleared);
  store.set(SESSION_COOKIE_NAME, "", clearedEmbedded);
}
