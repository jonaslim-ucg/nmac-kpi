import { SignJWT, jwtVerify } from "jose";
import { isAppRole } from "./role-id.ts";

export const SESSION_COOKIE_NAME = "nmac_session";

export type SessionPayload = {
  sub: string;
  email: string;
  role: string;
};

function getSecretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(s);
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const sub = payload.sub;
    const email = typeof payload.email === "string" ? payload.email : null;
    const role = payload.role;
    if (!sub || !email || !role) return null;
    if (!isAppRole(role)) return null;
    return { sub, email, role };
  } catch {
    return null;
  }
}

/** Edge-safe verify using raw token string (middleware). */
export async function verifySessionTokenEdge(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  if (!secret || secret.length < 32) return null;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    const sub = payload.sub;
    const email = typeof payload.email === "string" ? payload.email : null;
    const role = payload.role;
    if (!sub || !email || !role) return null;
    if (!isAppRole(role)) return null;
    return { sub, email, role };
  } catch {
    return null;
  }
}

export const sessionCookieMaxAgeSec = 60 * 60 * 24 * 7;
