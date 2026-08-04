import { createServiceRoleClient } from "@/lib/supabase/admin";
import { listInitialSurveyBouncesForReport } from "@/lib/survey-outreach/bounce-store";
import { summarizeUniqueInitialRecipients } from "@/lib/survey-outreach/sent-stats";
import type { DailyOutreachGroup } from "@/lib/survey-outreach/daily-group";
import type { SurveyOutreachLookup, SurveyOutreachRow, SurveyOutreachStage } from "@/lib/survey-outreach/types";

const STAGE_COLUMN: Record<SurveyOutreachStage, keyof SurveyOutreachRow> = {
  initial: "initial_sent_at",
  reminder1: "reminder_1_sent_at",
  reminder2: "reminder_2_sent_at",
  final: "final_sent_at",
};

export async function getOutreachByToken(token: string): Promise<SurveyOutreachRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach")
    .select("*")
    .eq("survey_token", token)
    .maybeSingle();
  if (error || !data) return null;
  return data as SurveyOutreachRow;
}

export async function getOutreachById(id: string): Promise<SurveyOutreachRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as SurveyOutreachRow) : null;
}

export async function getClaimedOutreach(
  id: string,
  lockToken: string,
  stage: SurveyOutreachStage,
): Promise<SurveyOutreachRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach")
    .select("*")
    .eq("id", id)
    .eq("send_lock_token", lockToken)
    .eq("send_lock_stage", stage)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? (data as SurveyOutreachRow) : null;
}

export async function lookupOutreachByToken(token: string): Promise<SurveyOutreachLookup | null> {
  const row = await getOutreachByToken(token);
  if (!row) return null;
  const dailyGroup = row.merged_into_outreach_id
    ? (await getOutreachById(row.merged_into_outreach_id)) ?? row
    : row;
  return {
    email: row.patient_email,
    patientName: row.patient_name,
    completed: row.completed_at !== null || dailyGroup.completed_at !== null,
    appointmentCount: Math.max(dailyGroup.crm_appointment_ids?.length ?? 0, 1),
    providerNames: dailyGroup.provider_names ?? [],
  };
}

export async function getActiveTestOutreach(email: string): Promise<SurveyOutreachRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach")
    .select("*")
    .eq("is_test", true)
    .ilike("patient_email", email.trim())
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as SurveyOutreachRow;
}

export async function createTestOutreach(input: {
  email: string;
  patientName: string;
  appointmentDate?: string;
  /** When the visit ended — initial email follows the configured 2-24h delay unless force=true on send. */
  appointmentFinishedAt?: string;
}): Promise<SurveyOutreachRow> {
  const supabase = createServiceRoleClient();
  const crmId = `test-${crypto.randomUUID()}`;
  const finishedAt = input.appointmentFinishedAt
    ? new Date(input.appointmentFinishedAt)
    : new Date();
  const appointmentDate =
    input.appointmentDate ?? finishedAt.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("survey_outreach")
    .insert({
      crm_appointment_id: crmId,
      patient_email: input.email.trim().toLowerCase(),
      patient_name: input.patientName.trim(),
      appointment_date: appointmentDate,
      appointment_at: finishedAt.toISOString(),
      is_test: true,
      status: "pending",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create test outreach row.");
  return data as SurveyOutreachRow;
}

export async function markStageSent(
  id: string,
  stage: SurveyOutreachStage,
  lockToken?: string,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const column = STAGE_COLUMN[stage];
  let query = supabase
    .from("survey_outreach")
    .update({
      [column]: new Date().toISOString(),
      manual_next_scheduled_at: null,
      send_lock_token: null,
      send_lock_stage: null,
      send_lock_until: null,
      send_attempt_count: 0,
      next_retry_at: null,
      last_send_error: null,
      failed_stage: null,
      permanently_failed_at: null,
      status: "sent",
    })
    .eq("id", id);

  if (lockToken) {
    query = query
      .eq("send_lock_token", lockToken)
      .eq("send_lock_stage", stage)
      .is(column, null);
  }

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The survey delivery claim is no longer active.");
}

export async function claimStageSend(input: {
  id: string;
  stage: SurveyOutreachStage;
  lockToken: string;
  lockUntil: string;
  now: string;
  expectedAttemptCount: number;
}): Promise<SurveyOutreachRow | null> {
  const supabase = createServiceRoleClient();
  const column = STAGE_COLUMN[input.stage];
  const { data, error } = await supabase
    .from("survey_outreach")
    .update({
      send_lock_token: input.lockToken,
      send_lock_stage: input.stage,
      send_lock_until: input.lockUntil,
      last_delivery_key: input.lockToken,
      send_attempt_count: input.expectedAttemptCount + 1,
      last_send_attempt_at: input.now,
      last_send_error: null,
    })
    .eq("id", input.id)
    .is("completed_at", null)
    .is("recalled_at", null)
    .is("permanently_failed_at", null)
    .in("status", ["pending", "sent"])
    .is(column, null)
    .eq("send_attempt_count", input.expectedAttemptCount)
    .or(`send_lock_until.is.null,send_lock_until.lt.${input.now}`)
    .or(`next_retry_at.is.null,next_retry_at.lte.${input.now}`)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? (data as SurveyOutreachRow) : null;
}

export async function extendStageSendClaim(input: {
  id: string;
  stage: SurveyOutreachStage;
  lockToken: string;
  lockUntil: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach")
    .update({ send_lock_until: input.lockUntil })
    .eq("id", input.id)
    .eq("send_lock_token", input.lockToken)
    .eq("send_lock_stage", input.stage)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The survey delivery claim expired before sending.");
}

export async function recordStageSendFailure(input: {
  id: string;
  stage: SurveyOutreachStage;
  lockToken: string;
  error: string;
  retryAt: string | null;
  now: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const retryable = Boolean(input.retryAt);
  const { data, error } = await supabase
    .from("survey_outreach")
    .update({
      send_lock_token: null,
      send_lock_stage: null,
      send_lock_until: null,
      next_retry_at: input.retryAt,
      last_send_error: input.error,
      failed_stage: input.stage,
      permanently_failed_at: retryable ? null : input.now,
      ...(retryable ? {} : { status: "failed" }),
    })
    .eq("id", input.id)
    .eq("send_lock_token", input.lockToken)
    .eq("send_lock_stage", input.stage)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The survey delivery claim was lost before the failure was saved.");
}

export async function markStageDeliveryUncertain(input: {
  id: string;
  stage: SurveyOutreachStage;
  lockToken: string;
  error: string;
  now: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach")
    .update({
      send_lock_token: null,
      send_lock_stage: null,
      send_lock_until: null,
      next_retry_at: null,
      last_send_error: input.error,
      failed_stage: input.stage,
      permanently_failed_at: input.now,
      status: "failed",
    })
    .eq("id", input.id)
    .eq("send_lock_token", input.lockToken)
    .eq("send_lock_stage", input.stage)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The survey delivery claim was lost before it could be quarantined.");
}

export async function releaseStageSendClaim(
  id: string,
  lockToken: string,
  restoreAttemptCount?: number,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("survey_outreach")
    .update({
      send_lock_token: null,
      send_lock_stage: null,
      send_lock_until: null,
      ...(restoreAttemptCount === undefined
        ? {}
        : { send_attempt_count: Math.max(0, restoreAttemptCount) }),
    })
    .eq("id", id)
    .eq("send_lock_token", lockToken);

  if (error) throw new Error(error.message);
}

export async function updateManualNextScheduledAt(
  id: string,
  manualNextScheduledAt: string | null,
): Promise<SurveyOutreachRow> {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("survey_outreach")
    .update({
      manual_next_scheduled_at: manualNextScheduledAt,
    })
    .eq("id", id)
    .is("completed_at", null);

  if (manualNextScheduledAt !== null) {
    query = query.eq("is_test", true);
  }

  const { data, error } = await query.select("*").single();

  if (!data && manualNextScheduledAt !== null) {
    throw new Error("Manual scheduling is only available for test rows.");
  }

  if (error || !data) {
    throw new Error(error?.message ?? "Could not update next scheduled survey time.");
  }

  return data as SurveyOutreachRow;
}

export async function markOutreachCompleted(token: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const row = await getOutreachByToken(token);
  if (!row) return;
  const ids = [row.id, row.merged_into_outreach_id].filter((id): id is string => Boolean(id));
  const { error } = await supabase
    .from("survey_outreach")
    .update({
      completed_at: new Date().toISOString(),
      status: "completed",
      manual_next_scheduled_at: null,
      send_lock_token: null,
      send_lock_stage: null,
      send_lock_until: null,
      next_retry_at: null,
      last_send_error: null,
      failed_stage: null,
      permanently_failed_at: null,
    })
    .in("id", ids)
    .is("completed_at", null);
  if (error) throw new Error(error.message);
}

export async function markOutreachRecalled(
  id: string,
  reason: string,
  lockToken?: string,
): Promise<void> {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("survey_outreach")
    .update({
      recalled_at: new Date().toISOString(),
      recall_reason: reason,
      status: "skipped",
      send_lock_token: null,
      send_lock_stage: null,
      send_lock_until: null,
      send_attempt_count: 0,
      next_retry_at: null,
      last_send_error: null,
      failed_stage: null,
      permanently_failed_at: null,
    })
    .eq("id", id)
    .is("completed_at", null);

  if (lockToken) query = query.eq("send_lock_token", lockToken);

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The outreach row changed before suppression could be saved.");
}

export async function resetTestOutreach(email: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach")
    .delete()
    .eq("is_test", true)
    .ilike("patient_email", email.trim())
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function upsertCrmOutreachBatch(
  rows: DailyOutreachGroup[],
): Promise<{ synced: number; exists: number }> {
  if (rows.length === 0) return { synced: 0, exists: 0 };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .rpc("sync_survey_outreach_daily_groups", {
      p_groups: rows.map((row) => ({
        groupKey: row.groupKey,
        patientAccNumber: row.patientAccNumber,
        patientEmail: row.patientEmail,
        patientName: row.patientName,
        appointmentDate: row.appointmentDate,
        appointmentAt: row.appointmentAt,
        appointmentIds: row.appointmentIds,
        appointmentProviders: row.appointmentProviders,
        providerNames: row.providerNames,
        visitTypes: row.visitTypes,
      })),
    });
  if (error) {
    if (/sync_survey_outreach_daily_groups|schema cache|function/i.test(error.message)) {
      throw new Error("Daily survey grouping is not installed. Production survey delivery was paused.");
    }
    throw new Error(error.message);
  }

  const { error: providerMappingError } = await supabase
    .rpc("merge_survey_outreach_appointment_providers", {
      p_groups: rows.map((row) => ({
        groupKey: row.groupKey,
        appointmentProviders: row.appointmentProviders,
      })),
    });
  if (
    providerMappingError &&
    !/merge_survey_outreach_appointment_providers|schema cache|function/i.test(providerMappingError.message)
  ) {
    throw new Error(providerMappingError.message);
  }

  const result = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    synced: Number(result.synced ?? 0),
    exists: Number(result.exists ?? 0),
  };
}

export async function upsertCrmOutreach(input: {
  crmAppointmentId: string;
  patientEmail: string;
  patientName: string;
  appointmentDate: string;
  appointmentAt: string;
}): Promise<"synced" | "exists" | "no_email"> {
  const supabase = createServiceRoleClient();
  const { data: existing } = await supabase
    .from("survey_outreach")
    .select("id")
    .eq("crm_appointment_id", input.crmAppointmentId)
    .maybeSingle();

  if (existing) return "exists";

  const { error } = await supabase.from("survey_outreach").insert({
    crm_appointment_id: input.crmAppointmentId,
    patient_email: input.patientEmail,
    patient_name: input.patientName,
    appointment_date: input.appointmentDate,
    appointment_at: input.appointmentAt,
    is_test: false,
    status: "pending",
  });

  if (error) {
    if (/duplicate|unique/i.test(error.message)) return "exists";
    throw new Error(error.message);
  }
  return "synced";
}

export async function listIncompleteOutreach(limit = 500): Promise<SurveyOutreachRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach")
    .select("*")
    .is("completed_at", null)
    .is("recalled_at", null)
    .is("permanently_failed_at", null)
    .is("final_sent_at", null)
    .in("status", ["pending", "sent"])
    .order("next_retry_at", { ascending: true, nullsFirst: true })
    .order("appointment_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 2000));

  if (error) throw new Error(error.message);
  return (data ?? []) as SurveyOutreachRow[];
}

export type SurveyOutreachListFilters = {
  limit?: number;
  offset?: number;
  search?: string;
  sentOnly?: boolean;
  testOnly?: boolean;
};

export type SurveyOutreachListResult = {
  rows: SurveyOutreachRow[];
  total: number;
  stats: {
    totalRows: number;
    initialRecipients: number;
    productionInitialRecipients: number;
    testInitialRecipients: number;
    failedRows: number;
  };
};

export type SurveyOutreachReportFilters = {
  sentFrom?: string;
  sentBefore?: string;
  includeTests?: boolean;
};

type SurveyOutreachReportResult =
  | { ok: true; rows: SurveyOutreachRow[] }
  | { ok: false; error: string; setupRequired?: boolean };

/** All production survey invitations sent in the requested interval. */
export async function listSurveyOutreachForReport(
  filters: SurveyOutreachReportFilters = {},
): Promise<SurveyOutreachReportResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "Survey outreach storage is not available." };
  }

  try {
    const supabase = createServiceRoleClient();
    const rows: SurveyOutreachRow[] = [];
    const pageSize = 1_000;
    let offset = 0;
    let total: number | null = null;

    while (true) {
      let query = supabase
        .from("survey_outreach")
        .select("*", { count: "exact" })
        .is("merged_into_outreach_id", null)
        .not("initial_sent_at", "is", null)
        .order("initial_sent_at", { ascending: false })
        .order("id", { ascending: false });

      if (!filters.includeTests) query = query.eq("is_test", false);
      if (filters.sentFrom) query = query.gte("initial_sent_at", filters.sentFrom);
      if (filters.sentBefore) query = query.lt("initial_sent_at", filters.sentBefore);

      const { data, error, count } = await query.range(offset, offset + pageSize - 1);
      if (error) {
        if (/survey_outreach|merged_into_outreach_id/i.test(error.message) && /does not exist|schema cache/i.test(error.message)) {
          return { ok: false, error: "Survey outreach storage is not configured.", setupRequired: true };
        }
        return { ok: false, error: "Could not load sent survey data." };
      }

      const page = (data ?? []) as SurveyOutreachRow[];
      rows.push(...page);
      total = count ?? total;
      if (page.length === 0 || (total !== null && rows.length >= total)) break;
      if (total === null && page.length < pageSize) break;
      offset += page.length;
    }

    return { ok: true, rows };
  } catch {
    return { ok: false, error: "Could not load sent survey data." };
  }
}

type SurveyOutreachTestTokenResult =
  | { ok: true; tokens: string[] }
  | { ok: false; error: string };

/** Resolve which linked review tokens belong to test outreach rows. */
export async function findTestSurveyOutreachTokens(
  surveyTokens: readonly string[],
): Promise<SurveyOutreachTestTokenResult> {
  const tokens = [...new Set(surveyTokens.map((token) => token.trim()).filter(Boolean))];
  if (tokens.length === 0) return { ok: true, tokens: [] };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "Survey outreach storage is not available." };
  }

  try {
    const supabase = createServiceRoleClient();
    const testTokens: string[] = [];
    const batchSize = 100;
    for (let offset = 0; offset < tokens.length; offset += batchSize) {
      const batch = tokens.slice(offset, offset + batchSize);
      const { data, error } = await supabase
        .from("survey_outreach")
        .select("survey_token")
        .eq("is_test", true)
        .in("survey_token", batch);
      if (error) return { ok: false, error: "Could not classify test survey responses." };
      testTokens.push(...(data ?? []).map((row) => String(row.survey_token)));
    }
    return { ok: true, tokens: testTokens };
  } catch {
    return { ok: false, error: "Could not classify test survey responses." };
  }
}

export function outreachStagesLabel(row: SurveyOutreachRow): string {
  const stages: string[] = [];
  if (row.initial_sent_at) stages.push("initial");
  if (row.reminder_1_sent_at) stages.push("reminder1");
  if (row.reminder_2_sent_at) stages.push("reminder2");
  if (row.final_sent_at) stages.push("final");
  return stages.length ? stages.join(", ") : "—";
}

export async function listSurveyOutreachForDev(
  filters: SurveyOutreachListFilters = {},
): Promise<SurveyOutreachListResult> {
  const supabase = createServiceRoleClient();
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const search = filters.search?.trim();

  let query = supabase
    .from("survey_outreach")
    .select("*", { count: "exact" })
    .order("initial_sent_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (filters.sentOnly !== false) {
    query = query.not("initial_sent_at", "is", null);
  }
  if (filters.testOnly === true) {
    query = query.eq("is_test", true);
  } else if (filters.testOnly === false) {
    query = query.eq("is_test", false);
  }
  if (search) {
    const term = `%${search.replace(/[%_]/g, "")}%`;
    query = query.or(`patient_email.ilike.${term},patient_name.ilike.${term}`);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const { count: totalRows } = await supabase
    .from("survey_outreach")
    .select("*", { count: "exact", head: true });

  const { count: failedRows } = await supabase
    .from("survey_outreach")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed");

  const initialRows: { id: string; patient_email: string | null; is_test: boolean }[] = [];
  const pageSize = 1_000;
  for (let pageOffset = 0; ; pageOffset += pageSize) {
    const { data: initialPage, error: initialPageError } = await supabase
      .from("survey_outreach")
      .select("id,patient_email,is_test")
      .not("initial_sent_at", "is", null)
      .range(pageOffset, pageOffset + pageSize - 1);
    if (initialPageError) throw new Error(initialPageError.message);
    initialRows.push(...((initialPage ?? []) as typeof initialRows));
    if ((initialPage?.length ?? 0) < pageSize) break;
  }
  const initialBounceResult = await listInitialSurveyBouncesForReport();
  if (!initialBounceResult.ok) throw new Error(initialBounceResult.error);
  const initialRecipients = summarizeUniqueInitialRecipients(initialRows, initialBounceResult.rows);

  return {
    rows: (data ?? []) as SurveyOutreachRow[],
    total: count ?? 0,
    stats: {
      totalRows: totalRows ?? 0,
      initialRecipients: initialRecipients.total,
      productionInitialRecipients: initialRecipients.production,
      testInitialRecipients: initialRecipients.tests,
      failedRows: failedRows ?? 0,
    },
  };
}
