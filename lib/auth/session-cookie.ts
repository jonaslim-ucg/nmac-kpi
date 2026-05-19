import { SESSION_COOKIE_NAME, sessionCookieMaxAgeSec } from "@/lib/auth/session";

export type SessionCookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "none";
  path: string;
  maxAge: number;
};

/** Cookie options for app session. Use `embedded: true` when the app runs in a Bitrix iframe. */
export function buildSessionCookieOptions(embedded?: boolean): SessionCookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd || embedded === true,
    sameSite: embedded ? "none" : "lax",
    path: "/",
    maxAge: sessionCookieMaxAgeSec,
  };
}

export function applySessionCookie(
  res: { cookies: { set: (name: string, value: string, options: SessionCookieOptions) => void } },
  token: string,
  embedded?: boolean,
): void {
  res.cookies.set(SESSION_COOKIE_NAME, token, buildSessionCookieOptions(embedded));
}
