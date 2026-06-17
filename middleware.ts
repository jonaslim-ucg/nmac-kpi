import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveSessionWithDatabase } from "@/lib/auth/sync-session";
import { buildSessionCookieOptions, clearSessionCookieOnResponse } from "@/lib/auth/session-cookie";
import { SESSION_COOKIE_NAME, verifySessionTokenEdge } from "@/lib/auth/session";

function isBitrixEmbeddedRequest(request: NextRequest): boolean {
  const referer = request.headers.get("referer") ?? "";
  return /bitrix24\.com/i.test(referer);
}

/** Home + legacy Bitrix URLs that pointed at weekly KPIs → NMAC master Performance overview. */
function isLandingRedirectPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/weekly";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let session: Awaited<ReturnType<typeof verifySessionTokenEdge>> = null;
  if (token && secret && secret.length >= 32) {
    session = await verifySessionTokenEdge(token, secret);
  }

  if (session) {
    const sync = await resolveSessionWithDatabase(session);
    if (!sync.ok) {
      session = null;
      const res =
        pathname === "/login"
          ? NextResponse.next()
          : NextResponse.redirect(new URL("/login?access=denied", request.url));
      clearSessionCookieOnResponse(res);
      return res;
    }
    session = sync.session;

    const embedded = isBitrixEmbeddedRequest(request);

    if (pathname === "/login") {
      const res = NextResponse.redirect(new URL("/nmac-2026", request.url));
      if (sync.refreshedToken) {
        res.cookies.set(SESSION_COOKIE_NAME, sync.refreshedToken, buildSessionCookieOptions(embedded));
      }
      return res;
    }

    if (isLandingRedirectPath(pathname)) {
      const res = NextResponse.redirect(new URL("/nmac-2026", request.url));
      if (sync.refreshedToken) {
        res.cookies.set(SESSION_COOKIE_NAME, sync.refreshedToken, buildSessionCookieOptions(embedded));
      }
      return res;
    }

    const denyUsers = pathname.startsWith("/admin/users") && session.role !== "admin";
    const denyDev = pathname.startsWith("/dev") && session.role !== "dev";
    const res = denyUsers || denyDev
      ? NextResponse.redirect(new URL("/nmac-2026", request.url))
      : NextResponse.next();

    if (sync.refreshedToken) {
      res.cookies.set(SESSION_COOKIE_NAME, sync.refreshedToken, buildSessionCookieOptions(embedded));
    }
    return res;
  }

  if (pathname === "/login") {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
