import { isBootstrapAdmin, isEmailDomainAllowed, isValidEmailFormat } from "@/lib/auth/email-policy";
import { signSessionToken } from "@/lib/auth/session";
import type { AppRole } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type EstablishSessionResult =
  | {
      ok: true;
      token: string;
      user: { id: string; email: string; role: AppRole };
    }
  | { ok: false; message: string; status: number };

/** Find or create `app_users` and issue a JWT (same rules as email OTP verify). */
export async function establishSessionForEmail(emailRaw: string): Promise<EstablishSessionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !isValidEmailFormat(email)) {
    return { ok: false, message: "Invalid email.", status: 400 };
  }
  if (!isEmailDomainAllowed(email)) {
    return {
      ok: false,
      message: "This email domain is not allowed to sign in.",
      status: 403,
    };
  }

  const supabase = createServiceRoleClient();
  const { data: existing } = await supabase.from("app_users").select("*").eq("email", email).maybeSingle();

  if (!existing) {
    const { count } = await supabase.from("app_users").select("*", { count: "exact", head: true });
    const isFirstUser = (count ?? 0) === 0;
    const role: AppRole = isFirstUser || isBootstrapAdmin(email) ? "admin" : "viewer";
    const { error: insertErr } = await supabase.from("app_users").insert({ email, role });
    if (insertErr) {
      console.error(insertErr);
      return { ok: false, message: "Could not create account.", status: 500 };
    }
  }

  const { data: user, error: userErr } = await supabase.from("app_users").select("*").eq("email", email).single();
  if (userErr || !user) {
    return { ok: false, message: "Account error.", status: 500 };
  }

  const role = user.role as AppRole;
  const token = await signSessionToken({
    sub: user.id as string,
    email: user.email as string,
    role,
  });

  return {
    ok: true,
    token,
    user: { id: user.id as string, email: user.email as string, role },
  };
}
