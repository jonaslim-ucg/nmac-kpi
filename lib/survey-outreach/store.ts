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

export async function markStageSent(id: string, stage: SurveyOutreachStage): Promise<void> {
  const supabase = createServiceRoleClient();
  const column = STAGE_COLUMN[stage];
  const { error } = await supabase
    .from("survey_outreach")
    .update({
      [column]: new Date().toISOString(),
      manual_next_scheduled_at: null,
      send_lock_token: null,
      send_lock_stage: null,
      send_lock_until: null,
      status: "sent",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function claimStageSend(input: {
  id: string;
  stage: SurveyOutreachStage;
  lockToken: string;
  lockUntil: string;
  now: string;
}): Promise<SurveyOutreachRow | null> {
  const supabase = createServiceRoleClient();
  const column = STAGE_COLUMN[input.stage];
  const { data, error } = await supabase
    .from("survey_outreach")
    .update({
      send_lock_token: input.lockToken,
      send_lock_stage: input.stage,
      send_lock_until: input.lockUntil,
    })
    .eq("id", input.id)
    .is("completed_at", null)
    .is(column, null)
    .or(`send_lock_until.is.null,send_lock_until.lt.${input.now}`)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? (data as SurveyOutreachRow) : null;
}

export async function releaseStageSendClaim(id: string, lockToken: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("survey_outreach")
    .update({
      send_lock_token: null,
      send_lock_stage: null,
      send_lock_until: null,
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
    })
    .eq("survey_token", token)
    .is("completed_at", null);
  if (error) throw new Error(error.message);
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
  const ids = rows.map((r) => r.crmAppointmentId);
  const { data: existingRows, error: existingError } = await supabase
    .from("survey_outreach")
    .select("crm_appointment_id")
    .in("crm_appointment_id", ids);

  if (existingError) throw new Error(existingError.message);

  const existing = new Set((existingRows ?? []).map((r) => r.crm_appointment_id));
  const toInsert = rows
    .filter((r) => !existing.has(r.crmAppointmentId))
    .map((r) => ({
      crm_appointment_id: r.crmAppointmentId,
      patient_email: r.patientEmail,
      patient_name: r.patientName,
      appointment_date: r.appointmentDate,
      appointment_at: r.appointmentAt,
      is_test: false,
      status: "pending",
    }));

  if (toInsert.length === 0) {
    return { synced: 0, exists: rows.length };
  }

  const { error } = await supabase.from("survey_outreach").insert(toInsert);
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { synced: 0, exists: rows.length };
    }
    throw new Error(error.message);
  }

  return { synced: toInsert.length, exists: rows.length - toInsert.length };
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

export async function listIncompleteOutreach(): Promise<SurveyOutreachRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach")
    .select("*")
    .is("completed_at", null)
    .order("appointment_at", { ascending: true });

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
    },
  };
}
