import { NextResponse } from "next/server";
import { isBootstrapAdmin } from "@/lib/auth/email-policy";
import type { AppRole } from "@/lib/auth/types";
import { verifyOtp } from "@/lib/auth/otp";
import {
  SESSION_COOKIE_NAME,
  sessionCookieMaxAgeSec,
  signSessionToken,
} from "@/lib/auth/session";
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

  const { data: existing } = await supabase.from("app_users").select("*").eq("email", email).maybeSingle();

  if (!existing) {
    const { count } = await supabase.from("app_users").select("*", { count: "exact", head: true });
    const isFirstUser = (count ?? 0) === 0;
    const role: AppRole =
      isFirstUser || isBootstrapAdmin(email) ? "admin" : "viewer";
    const { error: insertErr } = await supabase.from("app_users").insert({ email, role });
    if (insertErr) {
      console.error(insertErr);
      return NextResponse.json({ ok: false, message: "Could not create account." }, { status: 500 });
    }
  }

  const { data: user, error: userErr } = await supabase.from("app_users").select("*").eq("email", email).single();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, message: "Account error." }, { status: 500 });
  }

  const role = user.role as AppRole;
  const token = await signSessionToken({
    sub: user.id as string,
    email: user.email as string,
    role,
  });

  const res = NextResponse.json({
    ok: true,
    user: { email: user.email, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionCookieMaxAgeSec,
  });
  return res;
}
