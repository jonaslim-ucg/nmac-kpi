import { auditAppOpened } from "@/lib/dev/audit-log";
import type { AppRole } from "@/lib/auth/types";

type Actor = { email: string; role: AppRole };

export async function recordAppOpen(
  actor: Actor,
  via: "bitrix" | "browser",
): Promise<{ logged: boolean; setupRequired?: boolean; error?: string }> {
  try {
    auditAppOpened(actor, via);
    return { logged: true };
  } catch (err) {
    return {
      logged: false,
      error: err instanceof Error ? err.message : "Could not record activity.",
    };
  }
}
