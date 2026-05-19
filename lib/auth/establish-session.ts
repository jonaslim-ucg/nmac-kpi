import { lookupAppUserByEmail, NO_APP_ACCESS_MESSAGE } from "@/lib/auth/app-user-access";
import { isEmailDomainAllowed, isValidEmailFormat } from "@/lib/auth/email-policy";
import { signSessionToken } from "@/lib/auth/session";
import type { AppRole } from "@/lib/auth/types";

export type EstablishSessionResult =
  | {
      ok: true;
      token: string;
      user: { id: string; email: string; role: AppRole };
    }
  | { ok: false; message: string; status: number };

/** Issue a JWT only for emails already listed in `app_users` (admin directory). */
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

  const user = await lookupAppUserByEmail(email);
  if (!user) {
    return { ok: false, message: NO_APP_ACCESS_MESSAGE, status: 403 };
  }

  const role = user.role;
  const token = await signSessionToken({
    sub: user.id,
    email: user.email,
    role,
  });

  return {
    ok: true,
    token,
    user: { id: user.id, email: user.email, role },
  };
}
