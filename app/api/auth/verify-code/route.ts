import { NextResponse } from "next/server";
import { auditAuthSignedIn } from "@/lib/dev/audit-log";
import { establishSessionForEmail } from "@/lib/auth/establish-session";
import { verifyOtp } from "@/lib/auth/otp";
import { applySessionCookie } from "@/lib/auth/session-cookie";
import { createServiceRoleClient } from "@/lib/supabase/admin";

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
        message: "Signing in is not configured: add SUPABASE_SERVICE_ROLE_KEY from Supabase → Settings → API.",
      },
      { status: 500 },
    );
  }

  const body = (await req.json()) as { email?: string; code?: string };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim().replace(/\s/g, "") : "";
  if (!email || code.length !== 6 || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, message: "Enter the 6-digit code." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: row, error: fetchErr } = await supabase
    .from("auth_otp_codes")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json(
      { ok: false, message: "Code expired or not found. Request a new code." },
      { status: 400 },
    );
  }

  if (new Date(row.expires_at as string) < new Date()) {
    await supabase.from("auth_otp_codes").delete().eq("email", email);
    return NextResponse.json(
      { ok: false, message: "Code expired. Request a new code." },
      { status: 400 },
    );
  }

  if (!verifyOtp(secret, email, code, row.code_hash as string)) {
    return NextResponse.json({ ok: false, message: "Invalid code." }, { status: 400 });
  }

  await supabase.from("auth_otp_codes").delete().eq("email", email);

  const session = await establishSessionForEmail(email);
  if (!session.ok) {
    return NextResponse.json({ ok: false, message: session.message }, { status: session.status });
  }

  const res = NextResponse.json({
    ok: true,
    user: { email: session.user.email, role: session.user.role },
  });
  applySessionCookie(res, session.token);
  auditAuthSignedIn({ email: session.user.email, role: session.user.role }, "email_otp");
  return res;
}
