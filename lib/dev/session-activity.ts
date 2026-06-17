import { auditAppOpened } from "@/lib/dev/audit-log";
import type { AppRole } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const OPEN_DEDUPE_MS = 30 * 60 * 1000;

type Actor = { email: string; role: AppRole };

function isMissingDevLogsTable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("app_dev_logs") &&
    (m.includes("does not exist") ||
      m.includes("schema cache") ||
      m.includes("could not find") ||
      m.includes("relation"))
  );
}

export async function recordAppOpen(
  actor: Actor,
  via: "bitrix" | "browser",
): Promise<{ logged: boolean; setupRequired?: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const since = new Date(Date.now() - OPEN_DEDUPE_MS).toISOString();

    const { data: recent, error: recentError } = await supabase
      .from("app_dev_logs")
      .select("id")
      .eq("created_by_email", actor.email.toLowerCase())
      .eq("source", "auth")
      .gte("created_at", since)
      .ilike("message", "Opened app%")
      .limit(1);

    if (recentError) {
      if (isMissingDevLogsTable(recentError.message)) {
        return { logged: false, setupRequired: true, error: recentError.message };
      }
      return { logged: false, error: recentError.message };
    }

    if (recent && recent.length > 0) {
      return { logged: false };
    }

    auditAppOpened(actor, via);
    return { logged: true };
  } catch (err) {
    return {
      logged: false,
      error: err instanceof Error ? err.message : "Could not record activity.",
    };
  }
}
