import { createServiceRoleClient } from "@/lib/supabase/admin";

export const DEV_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type DevLogLevel = (typeof DEV_LOG_LEVELS)[number];

export type DevLogEntry = {
  id: number;
  level: DevLogLevel;
  message: string;
  source: string | null;
  context: Record<string, unknown> | null;
  created_by_email: string | null;
  created_at: string;
};

type DevLogRow = {
  id: number;
  level: DevLogLevel;
  message: string;
  source: string | null;
  context: Record<string, unknown> | null;
  created_by_email: string | null;
  created_at: string;
};

function rowToEntry(row: DevLogRow): DevLogEntry {
  return {
    id: row.id,
    level: row.level,
    message: row.message,
    source: row.source,
    context: row.context,
    created_by_email: row.created_by_email,
    created_at: row.created_at,
  };
}

export function isDevLogLevel(value: unknown): value is DevLogLevel {
  return typeof value === "string" && (DEV_LOG_LEVELS as readonly string[]).includes(value);
}

export type AppendDevLogInput = {
  level: DevLogLevel;
  message: string;
  source?: string | null;
  context?: Record<string, unknown> | null;
  createdByEmail?: string | null;
};

export async function appendDevLog(input: AppendDevLogInput): Promise<DevLogEntry | null> {
  const message = input.message.trim();
  if (!message) return null;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_dev_logs")
    .insert({
      level: input.level,
      message,
      source: input.source?.trim() || null,
      context: input.context ?? null,
      created_by_email: input.createdByEmail?.trim().toLowerCase() || null,
    })
    .select("id,level,message,source,context,created_by_email,created_at")
    .single();

  if (error || !data) {
    console.error("[dev-log]", error);
    return null;
  }

  return rowToEntry(data as DevLogRow);
}

export async function listDevLogs(limit = 100): Promise<DevLogEntry[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_dev_logs")
    .select("id,level,message,source,context,created_by_email,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));

  if (error || !data) {
    console.error("[dev-log]", error);
    return [];
  }

  return (data as DevLogRow[]).map(rowToEntry);
}

export async function clearDevLogs(): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("app_dev_logs").delete().neq("id", 0);
  if (error) {
    console.error("[dev-log]", error);
    return false;
  }
  return true;
}
