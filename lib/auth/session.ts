import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth/session-token";

export * from "@/lib/auth/session-token";

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    const session = await verifySessionToken(token);
    if (!session) return null;

    const { resolveSessionWithDatabase, persistRefreshedSessionToken, clearSessionCookie } =
      await import("@/lib/auth/sync-session");
    const sync = await resolveSessionWithDatabase(session);
    if (!sync.ok) {
      await clearSessionCookie();
      return null;
    }
    if (sync.refreshedToken) {
      await persistRefreshedSessionToken(sync.refreshedToken);
    }
    return sync.session;
  } catch {
    return null;
  }
}
