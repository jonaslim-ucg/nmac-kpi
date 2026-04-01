import { NextResponse } from "next/server";
import { isEmailDomainAllowed, isValidEmailFormat } from "@/lib/auth/email-policy";
import { generateOtpCode, hashOtpForStorage } from "@/lib/auth/otp";
import { sendMailViaGraph } from "@/lib/graph/send-mail";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string };
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    if (!isValidEmailFormat(emailRaw)) {
      return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
    }
    if (!isEmailDomainAllowed(emailRaw)) {
      return NextResponse.json({ ok: false, message: "That email domain is not allowed." }, { status: 403 });
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Signing in is not configured: add AUTH_SECRET (32+ characters) to your environment and restart the dev server.",
        },
        { status: 500 },
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Signing in is not configured: add SUPABASE_SERVICE_ROLE_KEY from Supabase → Settings → API, then restart.",
        },
        { status: 500 },
      );
    }

    const email = emailRaw.toLowerCase();
    const code = generateOtpCode();
    const codeHash = hashOtpForStorage(secret, email, code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("auth_otp_codes").upsert(
      {
        email,
        code_hash: codeHash,
        expires_at: expiresAt,
      },
      { onConflict: "email" },
    );

    if (error) {
      console.error(error);
      return NextResponse.json({ ok: false, message: "Could not prepare sign-in." }, { status: 500 });
    }

    await sendMailViaGraph({
      to: emailRaw,
      subject: "Your NMAC KPI sign-in code",
      textBody: `Your sign-in code is: ${code}\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: "Could not send email." }, { status: 500 });
  }
}
