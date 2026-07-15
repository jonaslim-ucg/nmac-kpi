import { createServiceRoleClient } from "@/lib/supabase/admin";
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
  return {
    email: row.patient_email,
    patientName: row.patient_name,
    completed: row.completed_at !== null,
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
    .eq("survey_token", token)
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
  rows: {
    crmAppointmentId: string;
    patientEmail: string;
    patientName: string;
    appointmentDate: string;
    appointmentAt: string;
  }[],
): Promise<{ synced: number; exists: number }> {
  if (rows.length === 0) return { synced: 0, exists: 0 };

  const supabase = createServiceRoleClient();
  const uniqueRows = [...new Map(rows.map((row) => [row.crmAppointmentId, row])).values()];
  const toInsert = uniqueRows.map((r) => ({
    crm_appointment_id: r.crmAppointmentId,
    patient_email: r.patientEmail,
    patient_name: r.patientName,
    appointment_date: r.appointmentDate,
    appointment_at: r.appointmentAt,
    is_test: false,
    status: "pending",
  }));

  const { data, error } = await supabase
    .from("survey_outreach")
    .upsert(toInsert, {
      onConflict: "crm_appointment_id",
      ignoreDuplicates: true,
    })
    .select("crm_appointment_id");
  if (error) throw new Error(error.message);

  const synced = data?.length ?? 0;
  return { synced, exists: uniqueRows.length - synced };
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
    withInitialSent: number;
    uniqueRecipients: number;
    testRows: number;
    failedRows: number;
  };
};

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

  const { count: withInitialSent } = await supabase
    .from("survey_outreach")
    .select("*", { count: "exact", head: true })
    .not("initial_sent_at", "is", null);

  const { count: testRows } = await supabase
    .from("survey_outreach")
    .select("*", { count: "exact", head: true })
    .eq("is_test", true)
    .not("initial_sent_at", "is", null);

  const { count: failedRows } = await supabase
    .from("survey_outreach")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed");

  const { data: uniqueEmails } = await supabase
    .from("survey_outreach")
    .select("patient_email")
    .not("initial_sent_at", "is", null);

  const uniqueRecipients = new Set(
    (uniqueEmails ?? []).map((r) => String(r.patient_email).toLowerCase()),
  ).size;

  return {
    rows: (data ?? []) as SurveyOutreachRow[],
    total: count ?? 0,
    stats: {
      totalRows: totalRows ?? 0,
      withInitialSent: withInitialSent ?? 0,
      uniqueRecipients,
      testRows: testRows ?? 0,
      failedRows: failedRows ?? 0,
    },
  };
}
