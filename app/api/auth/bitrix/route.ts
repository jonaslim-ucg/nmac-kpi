import { NextResponse } from "next/server";
import { auditAuthSignedIn } from "@/lib/dev/audit-log";
import { establishSessionForEmails } from "@/lib/auth/establish-session";
import { getMaintenanceBlockForRole } from "@/lib/auth/maintenance-mode";
import { applySessionCookie } from "@/lib/auth/session-cookie";
import { fetchBitrixUserCurrent } from "@/lib/bitrix/integration-rest";
import { isPortalAllowedByEnv, isValidBitrixPortalDomain, normalizePortalDomain } from "@/lib/bitrix/portal";

export async function POST(req: Request) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Signing in is not configured: add AUTH_SECRET (32+ characters) to your environment and restart.",
      },
      { status: 500 },
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        message: "Signing in is not configured: add SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 },
    );
  }

  const body = (await req.json()) as {
    access_token?: string;
    auth?: string;
    domain?: string;
    embedded?: boolean;
  };

  const accessToken =
    (typeof body.access_token === "string" && body.access_token.trim()) ||
    (typeof body.auth === "string" && body.auth.trim()) ||
    "";
  const domain = normalizePortalDomain(typeof body.domain === "string" ? body.domain : "");
  const embedded = body.embedded === true;

  if (!accessToken || !domain) {
    return NextResponse.json(
      { ok: false, message: "Bitrix domain and access_token are required." },
      { status: 400 },
    );
  }

  if (!isValidBitrixPortalDomain(domain)) {
    return NextResponse.json({ ok: false, message: "Invalid Bitrix portal domain." }, { status: 400 });
  }

  if (!isPortalAllowedByEnv(domain)) {
    return NextResponse.json(
      { ok: false, message: "This Bitrix portal is not allowed for this deployment." },
      { status: 403 },
    );
  }

  const bx = await fetchBitrixUserCurrent(domain, accessToken);
  if (!bx.ok) {
    return NextResponse.json(
      { ok: false, message: bx.message || "Bitrix authorization failed." },
      { status: bx.httpStatus === 502 || bx.httpStatus === 504 ? bx.httpStatus : 401 },
    );
  }

  if (bx.user.emails.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Your Bitrix profile has no email. Add a work or personal email in Bitrix24 profile settings, then reload this app.",
      },
      { status: 401 },
    );
  }

  const session = await establishSessionForEmails(bx.user.emails);
  if (!session.ok) {
    return NextResponse.json({ ok: false, message: session.message }, { status: session.status });
  }

  const maintenance = await getMaintenanceBlockForRole(session.user.role);
  if (maintenance.blocked) {
    return NextResponse.json({ ok: false, message: maintenance.message, maintenance: true }, { status: 503 });
  }

  const res = NextResponse.json({
    ok: true,
    user: { email: session.user.email, role: session.user.role },
    displayName: bx.user.displayName,
  });
  applySessionCookie(res, session.token, embedded);
  auditAuthSignedIn(
    { email: session.user.email, role: session.user.role },
    "bitrix",
    { portal: domain, displayName: bx.user.displayName },
  );
  return res;
}
