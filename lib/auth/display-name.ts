import type { SessionUser } from "@/lib/auth/session-user";

/** Prefer "First Last"; fall back to email when names are empty. */
export function formatDisplayName(
  user: Pick<SessionUser, "email" | "firstName" | "lastName"> | null | undefined,
): string {
  if (!user) return "—";
  const first = user.firstName?.trim() ?? "";
  const last = user.lastName?.trim() ?? "";
  const combined = [first, last].filter(Boolean).join(" ");
  return combined || user.email;
}
