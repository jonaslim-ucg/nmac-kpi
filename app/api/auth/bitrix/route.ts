import { NextResponse } from "next/server";
import { establishSessionForEmail } from "@/lib/auth/establish-session";
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
      { status: 401 },
    );
  }

  const emailRaw = bx.user.email?.trim() ?? "";
  if (!emailRaw) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Your Bitrix profile has no work email. Add an email in Bitrix24 profile settings, then reload this app.",
      },
      { status: 401 },
    );
  }

  const session = await establishSessionForEmail(emailRaw);
  if (!session.ok) {
    return NextResponse.json({ ok: false, message: session.message }, { status: session.status });
  }

  const res = NextResponse.json({
    ok: true,
    user: { email: session.user.email, role: session.user.role },
    displayName: bx.user.displayName,
  });
  applySessionCookie(res, session.token, embedded);
  return res;
}
