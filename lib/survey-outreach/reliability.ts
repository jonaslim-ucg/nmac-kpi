import type { SurveyOutreachStage } from "./types";

const RETRY_MINUTES = [2, 5, 15, 60, 240] as const;

export const MAX_SURVEY_SEND_ATTEMPTS = RETRY_MINUTES.length + 1;

function intFromEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function surveyOutreachMaxSendsPerRun(): number {
  return intFromEnv(process.env.SURVEY_OUTREACH_MAX_SENDS_PER_RUN, 5, 1, 100);
}

export function surveyOutreachScanLimit(): number {
  return intFromEnv(process.env.SURVEY_OUTREACH_SCAN_LIMIT, 500, 25, 2000);
}

export function surveySendRetryAt(input: {
  attempt: number;
  now: Date;
  retryAfterMs?: number | null;
}): Date | null {
  if (input.attempt >= MAX_SURVEY_SEND_ATTEMPTS) return null;
  const policyMs = RETRY_MINUTES[Math.max(0, input.attempt - 1)] * 60 * 1000;
  const delayMs = Math.max(policyMs, input.retryAfterMs ?? 0);
  return new Date(input.now.getTime() + delayMs);
}

export function schedulerConfigurationStatus() {
  const missing: string[] = [];
  const cronAuthConfigured = process.env.NODE_ENV === "production"
    ? Boolean(process.env.CRON_SECRET?.trim())
    : Boolean(process.env.CRON_SECRET?.trim() || process.env.SURVEY_OUTREACH_SECRET?.trim());
  const crmConfigured = Boolean(process.env.REPORTS_API_TOKEN?.trim());
  const mailConfigured = Boolean(
    process.env.AZURE_TENANT_ID?.trim() &&
      process.env.AZURE_CLIENT_ID?.trim() &&
      process.env.AZURE_CLIENT_SECRET?.trim() &&
      process.env.GRAPH_SENDER_EMAIL?.trim(),
  );
  const databaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );

  if (!cronAuthConfigured) missing.push("CRON_SECRET");
  if (!crmConfigured) missing.push("REPORTS_API_TOKEN");
  if (!mailConfigured) missing.push("Microsoft Graph mail settings");
  if (!databaseConfigured) missing.push("Supabase settings");

  return {
    ready: missing.length === 0,
    cronAuthConfigured,
    crmConfigured,
    mailConfigured,
    databaseConfigured,
    missing,
  };
}

export function compactSendError(error: unknown, stage: SurveyOutreachStage): string {
  const message = error instanceof Error ? error.message : "Unknown send failure";
  return `${stage}: ${message}`.slice(0, 1000);
}
