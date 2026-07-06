import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  canBypassMaintenance,
  isMaintenanceModeEnabledEdge,
  MAINTENANCE_BLOCK_MESSAGE,
} from "@/lib/auth/maintenance-mode";
import { resolveSessionWithDatabase } from "@/lib/auth/sync-session";
import { canAccessDev, canManageUsers } from "@/lib/auth/types";
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

function isAuthAttemptApi(pathname: string): boolean {
  return (
    pathname === "/api/auth/bitrix" ||
    pathname === "/api/auth/verify-code" ||
    pathname === "/api/auth/send-code"
  );
}

function isPublicPage(pathname: string): boolean {
  return pathname === "/login" || pathname === "/maintenance" || pathname === "/appointment-review";
}

function isMaintenanceExemptApi(pathname: string): boolean {
  return (
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/session" ||
    pathname === "/api/appointment-review" ||
    pathname.startsWith("/api/survey-outreach/lookup") ||
    pathname.startsWith("/api/survey-outreach/cron") ||
    pathname.startsWith("/api/survey-outreach/test") ||
    pathname.startsWith("/api/dev/maintenance") ||
    isAuthAttemptApi(pathname)
  );
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

  const secret = process.env.AUTH_SECRET;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let session: Awaited<ReturnType<typeof verifySessionTokenEdge>> = null;
  let refreshedToken: string | undefined;

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
    refreshedToken = sync.refreshedToken;
  }

  const maintenanceOn = await isMaintenanceModeEnabledEdge();
  const bypassMaintenance = session ? canBypassMaintenance(session.role) : false;

  if (pathname.startsWith("/api")) {
    if (!maintenanceOn || bypassMaintenance || isMaintenanceExemptApi(pathname)) {
      return NextResponse.next();
    }
    return NextResponse.json(
      { error: MAINTENANCE_BLOCK_MESSAGE, maintenance: true },
      { status: 503 },
    );
  }

  if (maintenanceOn) {
    if (pathname === "/maintenance") {
      return NextResponse.next();
    }

    if (session && !bypassMaintenance) {
      if (pathname !== "/maintenance") {
        return NextResponse.redirect(new URL("/maintenance", request.url));
      }
      return NextResponse.next();
    }

    if (!session && !isPublicPage(pathname)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("maintenance", "1");
      return NextResponse.redirect(loginUrl);
    }
  }

  if (session) {
    const embedded = isBitrixEmbeddedRequest(request);

    if (pathname === "/login") {
      const res = NextResponse.redirect(new URL("/nmac-2026", request.url));
      if (refreshedToken) {
        res.cookies.set(SESSION_COOKIE_NAME, refreshedToken, buildSessionCookieOptions(embedded));
      }
      return res;
    }

    if (isLandingRedirectPath(pathname)) {
      const res = NextResponse.redirect(new URL("/nmac-2026", request.url));
      if (refreshedToken) {
        res.cookies.set(SESSION_COOKIE_NAME, refreshedToken, buildSessionCookieOptions(embedded));
      }
      return res;
    }

    const denyUsers = pathname.startsWith("/admin/users") && !canManageUsers(session.role);
    const denyDev = pathname.startsWith("/dev") && !canAccessDev(session.role);
    const res = denyUsers || denyDev
      ? NextResponse.redirect(new URL("/nmac-2026", request.url))
      : NextResponse.next();

    if (refreshedToken) {
      res.cookies.set(SESSION_COOKIE_NAME, refreshedToken, buildSessionCookieOptions(embedded));
    }
    return res;
  }

  if (isPublicPage(pathname)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
