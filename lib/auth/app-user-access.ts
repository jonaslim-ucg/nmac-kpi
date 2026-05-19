import type { AppRole } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

function supabaseServiceHeaders(): Record<string, string> | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return null;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
}

/** Edge-safe directory lookup (middleware + Node). Returns null if missing or on error. */
export async function fetchAppUserById(
  id: string,
): Promise<{ email: string; role: AppRole } | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const headers = supabaseServiceHeaders();
  if (!base || !headers) return null;

  try {
    const res = await fetch(
      `${base}/rest/v1/app_users?id=eq.${encodeURIComponent(id)}&select=email,role`,
      { headers, cache: "no-store" },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { email: string; role: AppRole }[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0]!;
    if (!row.email || !row.role) return null;
    return { email: row.email, role: row.role };
  } catch {
    return null;
  }
}

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
