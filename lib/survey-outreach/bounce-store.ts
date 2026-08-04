import { APP_SETTINGS_ID } from "@/lib/auth/app-settings";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  summarizeUniqueSurveyBounces,
  uniqueSurveyBounceRows,
} from "@/lib/survey-outreach/bounce-dedupe";
import type { SurveyOutreachRow, SurveyOutreachStage } from "@/lib/survey-outreach/types";

const STAGE_SENT_COLUMN: Record<SurveyOutreachStage, keyof SurveyOutreachRow> = {
  initial: "initial_sent_at",
  reminder1: "reminder_1_sent_at",
  reminder2: "reminder_2_sent_at",
  final: "final_sent_at",
};

export type SurveyOutreachBounceRow = {
  id: string;
  graph_message_id: string;
  graph_sent_message_id: string | null;
  original_internet_message_id: string | null;
  delivery_key: string | null;
  outreach_id: string | null;
  recipient_email: string | null;
  original_subject: string;
  stage: SurveyOutreachStage | null;
  is_test: boolean | null;
  received_at: string;
  status_code: string | null;
  reason: string;
  diagnostic: string;
  hard_bounce: boolean;
};

export type SurveyOutreachBounceSummary = {
  total: number;
  production: number;
  tests: number;
  unmatched: number;
  hard: number;
};

export type SurveyOutreachBounceScanState = {
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export type SurveyOutreachBounceScanLease = {
  token: string;
  state: SurveyOutreachBounceScanState;
};

export type RecordSurveyBounceInput = {
  graphMessageId: string;
  graphSentMessageId: string | null;
  originalInternetMessageId: string | null;
  deliveryKey: string | null;
  recipientEmail: string | null;
  originalSubject: string;
  stage: SurveyOutreachStage | null;
  receivedAt: string;
  originalSentAt: string | null;
  statusCode: string | null;
  reason: string;
  diagnostic: string;
  hardBounce: boolean;
};

function schemaMissing(message: string): boolean {
  return /survey_outreach_bounces|survey_outreach_bounce_/i.test(message)
    && /does not exist|schema cache|could not find/i.test(message);
}

function normalizedEmail(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

async function findOutreachForBounce(input: RecordSurveyBounceInput): Promise<SurveyOutreachRow | null> {
  const supabase = createServiceRoleClient();

  if (input.deliveryKey) {
    const { data, error } = await supabase
      .from("survey_outreach")
      .select("*")
      .eq("last_delivery_key", input.deliveryKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as SurveyOutreachRow;
  }

  const recipient = normalizedEmail(input.recipientEmail);
  if (!recipient || !input.stage) return null;
  const sentColumn = STAGE_SENT_COLUMN[input.stage];
  const sentAt = input.originalSentAt ? new Date(input.originalSentAt) : null;
  const receivedAt = new Date(input.receivedAt);
  const target = sentAt && Number.isFinite(sentAt.getTime()) ? sentAt : receivedAt;
  if (!Number.isFinite(target.getTime())) return null;

  const windowStart = new Date(target.getTime() - 15 * 60 * 1000).toISOString();
  const windowEnd = new Date(target.getTime() + 15 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("survey_outreach")
    .select("*")
    .ilike("patient_email", recipient)
    .gte(String(sentColumn), windowStart)
    .lte(String(sentColumn), windowEnd)
    .order(String(sentColumn), { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);
  if (!data?.length) return null;

  return (data as SurveyOutreachRow[]).reduce((nearest, row) => {
    const nearestAt = new Date(String(nearest[sentColumn])).getTime();
    const rowAt = new Date(String(row[sentColumn])).getTime();
    return Math.abs(rowAt - target.getTime()) < Math.abs(nearestAt - target.getTime()) ? row : nearest;
  });
}

async function suppressHardBounce(row: SurveyOutreachRow, reason: string, at: string): Promise<boolean> {
  if (row.is_test) return false;
  const supabase = createServiceRoleClient();
  const patientEmail = row.patient_email.trim().toLowerCase();
  const suppressionReason = `Outlook non-delivery report: ${reason}`.slice(0, 500);
  const { error: suppressionError } = await supabase
    .from("survey_email_suppressions")
    .upsert({ patient_email: patientEmail, reason: suppressionReason }, { onConflict: "patient_email" });
  if (suppressionError) throw new Error(suppressionError.message);

  const { error: recallError } = await supabase
    .from("survey_outreach")
    .update({
      recalled_at: at,
      recall_reason: suppressionReason,
    })
    .eq("is_test", false)
    .ilike("patient_email", patientEmail)
    .is("completed_at", null)
    .is("recalled_at", null);
  if (recallError) throw new Error(recallError.message);
  return true;
}

export async function existingSurveyBounceMessageIds(messageIds: readonly string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach_bounces")
    .select("graph_message_id")
    .in("graph_message_id", [...messageIds]);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => String(row.graph_message_id)));
}

export async function recordSurveyBounce(input: RecordSurveyBounceInput): Promise<{
  created: boolean;
  matched: boolean;
  suppressed: boolean;
}> {
  const supabase = createServiceRoleClient();
  const outreach = await findOutreachForBounce(input);
  const recipientEmail = normalizedEmail(input.recipientEmail ?? outreach?.patient_email ?? null);
  const suppressed = Boolean(outreach && input.hardBounce)
    ? await suppressHardBounce(outreach!, input.reason, input.receivedAt)
    : false;
  const { error } = await supabase.from("survey_outreach_bounces").insert({
    graph_message_id: input.graphMessageId,
    graph_sent_message_id: input.graphSentMessageId,
    original_internet_message_id: input.originalInternetMessageId,
    delivery_key: input.deliveryKey,
    outreach_id: outreach?.id ?? null,
    recipient_email: recipientEmail,
    original_subject: input.originalSubject,
    stage: input.stage,
    is_test: outreach?.is_test ?? null,
    received_at: input.receivedAt,
    status_code: input.statusCode,
    reason: input.reason,
    diagnostic: input.diagnostic,
    hard_bounce: input.hardBounce,
  });

  if (error) {
    if (/duplicate|unique/i.test(error.message) && /graph_message_id/i.test(error.message)) {
      return { created: false, matched: Boolean(outreach), suppressed };
    }
    throw new Error(error.message);
  }

  return { created: true, matched: Boolean(outreach), suppressed };
}

function bounceScanState(data: {
  survey_outreach_bounce_last_checked_at?: string | null;
  survey_outreach_bounce_last_success_at?: string | null;
  survey_outreach_bounce_last_error?: string | null;
} | null): SurveyOutreachBounceScanState {
  return {
    lastCheckedAt: data?.survey_outreach_bounce_last_checked_at ?? null,
    lastSuccessAt: data?.survey_outreach_bounce_last_success_at ?? null,
    lastError: data?.survey_outreach_bounce_last_error ?? null,
  };
}

export async function claimSurveyBounceScan(
  now: Date,
  lockMs = 5 * 60 * 1_000,
): Promise<SurveyOutreachBounceScanLease | null> {
  const supabase = createServiceRoleClient();
  const token = crypto.randomUUID();
  const { data, error } = await supabase
    .from("app_settings")
    .update({
      survey_outreach_bounce_lock_token: token,
      survey_outreach_bounce_lock_until: new Date(now.getTime() + lockMs).toISOString(),
    })
    .eq("id", APP_SETTINGS_ID)
    .or(
      `survey_outreach_bounce_lock_until.is.null,survey_outreach_bounce_lock_until.lt.${now.toISOString()}`,
    )
    .select(
      "survey_outreach_bounce_last_checked_at,survey_outreach_bounce_last_success_at,survey_outreach_bounce_last_error",
    )
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { token, state: bounceScanState(data) } : null;
}

export async function recordSurveyBounceScan(input: {
  lockToken: string;
  checkedAt: string;
  successful: boolean;
  error: string | null;
  result: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      survey_outreach_bounce_last_checked_at: input.checkedAt,
      ...(input.successful ? { survey_outreach_bounce_last_success_at: input.checkedAt } : {}),
      survey_outreach_bounce_last_error: input.error,
      survey_outreach_bounce_last_result: input.result,
      survey_outreach_bounce_lock_token: null,
      survey_outreach_bounce_lock_until: null,
    })
    .eq("id", APP_SETTINGS_ID)
    .eq("survey_outreach_bounce_lock_token", input.lockToken);
  if (error) throw new Error(error.message);
}

export async function listSurveyOutreachBounces(limit = 20): Promise<SurveyOutreachBounceRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach_bounces")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(1_000);
  if (error) {
    if (schemaMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return uniqueSurveyBounceRows((data ?? []) as SurveyOutreachBounceRow[])
    .slice(0, Math.min(Math.max(limit, 1), 100));
}

export async function getSurveyOutreachBounceSummary(): Promise<SurveyOutreachBounceSummary> {
  const supabase = createServiceRoleClient();
  const rows: Pick<
    SurveyOutreachBounceRow,
    "graph_message_id" | "recipient_email" | "outreach_id" | "is_test" | "hard_bounce"
  >[] = [];
  const pageSize = 1_000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("survey_outreach_bounces")
      .select("graph_message_id,recipient_email,outreach_id,is_test,hard_bounce")
      .order("received_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      if (schemaMissing(error.message)) return { total: 0, production: 0, tests: 0, unmatched: 0, hard: 0 };
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as typeof rows));
    if ((data?.length ?? 0) < pageSize) break;
  }

  return summarizeUniqueSurveyBounces(rows);
}
