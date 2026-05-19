import type { AppRole } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const NO_APP_ACCESS_MESSAGE =
  "You don't have access to NMAC KPI. Ask an administrator to add your email to the user directory.";

export type AppUserRecord = {
  id: string;
  email: string;
  role: AppRole;
};

/** Returns the user row when `email` is in the admin-managed directory (`app_users`). */
export async function lookupAppUserByEmail(emailRaw: string): Promise<AppUserRecord | null> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return null;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,email,role")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    email: data.email as string,
    role: data.role as AppRole,
  };
}

/** First directory match among candidate emails (e.g. Bitrix work + personal mailboxes). */
export async function lookupAppUserByEmails(candidates: string[]): Promise<AppUserRecord | null> {
  const seen = new Set<string>();
  for (const raw of candidates) {
    const email = raw.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const user = await lookupAppUserByEmail(email);
    if (user) return user;
  }
  return null;
}
