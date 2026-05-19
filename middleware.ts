import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveSessionWithDatabase } from "@/lib/auth/sync-session";
import { buildSessionCookieOptions } from "@/lib/auth/session-cookie";
import { SESSION_COOKIE_NAME, verifySessionTokenEdge } from "@/lib/auth/session";

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

  if (pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { session: synced, refreshedToken } = await resolveSessionWithDatabase(session);
  session = synced;

  const denyUsers = pathname.startsWith("/admin/users") && session.role !== "admin";
  const res = denyUsers
    ? NextResponse.redirect(new URL("/", request.url))
    : NextResponse.next();

  if (refreshedToken) {
    res.cookies.set(SESSION_COOKIE_NAME, refreshedToken, buildSessionCookieOptions());
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
