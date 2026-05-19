import { cookies } from "next/headers";
import type { SessionPayload } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth/session";
import { fetchAppUserById } from "@/lib/auth/app-user-access";
import { buildSessionCookieOptions } from "@/lib/auth/session-cookie";
import type { AppRole } from "@/lib/auth/types";

export type SessionSyncResult =
  | { ok: true; session: SessionPayload; refreshedToken?: string }
  | { ok: false; revoked: true };

/** Align JWT with `app_users`, or revoke when the user was removed from the directory. */
export async function resolveSessionWithDatabase(
  session: SessionPayload,
): Promise<SessionSyncResult> {
  const row = await fetchAppUserById(session.sub);
  if (!row) {
    return { ok: false, revoked: true };
  }

  const email = row.email;
  const role = row.role as AppRole;
  if (email === session.email && role === session.role) {
    return { ok: true, session };
  }

  try {
    const refreshedToken = await signSessionToken({ sub: session.sub, email, role });
    return {
      ok: true,
      session: { sub: session.sub, email, role },
      refreshedToken,
    };
  } catch {
    return { ok: false, revoked: true };
  }
}

export async function persistRefreshedSessionToken(token: string, embedded?: boolean): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, buildSessionCookieOptions(embedded));
}

/** Clear session cookie in Route Handlers / Server Components. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const cleared = { ...buildSessionCookieOptions(), maxAge: 0 };
  const clearedEmbedded = { ...buildSessionCookieOptions(true), maxAge: 0 };
  store.set(SESSION_COOKIE_NAME, "", cleared);
  store.set(SESSION_COOKIE_NAME, "", clearedEmbedded);
}
