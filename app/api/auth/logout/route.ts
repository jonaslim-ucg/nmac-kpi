import { NextResponse } from "next/server";
import { auditAuthSignedOut } from "@/lib/dev/audit-log";
import { getSessionFromCookies } from "@/lib/auth/session";
import { clearSessionCookieOnResponse } from "@/lib/auth/session-cookie";

export async function POST() {
  const session = await getSessionFromCookies();
  if (session) {
    await auditAuthSignedOut({ email: session.email, role: session.role });
  }

  const res = NextResponse.json({ ok: true });
  clearSessionCookieOnResponse(res);
  return res;
}
