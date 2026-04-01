import { createHash, randomInt, timingSafeEqual } from "crypto";

function hashOtp(secret: string, email: string, code: string): string {
  return createHash("sha256")
    .update(`${secret}:${email.toLowerCase().trim()}:${code}`)
    .digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtpForStorage(secret: string, email: string, code: string): string {
  return hashOtp(secret, email, code);
}

export function verifyOtp(secret: string, email: string, code: string, storedHash: string): boolean {
  const h = hashOtp(secret, email, code);
  try {
    const a = Buffer.from(h, "hex");
    const b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
