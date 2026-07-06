import { fetchCrmAppointments, crmSyncDates, type CrmAppointmentRow } from "@/lib/crm/appointments";
import { isScheduledTestRecipientAllowed, isSurveyOutreachSendingEnabled } from "@/lib/survey-outreach/config";
import { parseCrmAppointmentAt } from "@/lib/survey-outreach/parse-appointment";
import { getSurveyOutreachSchedule } from "@/lib/survey-outreach/schedule-settings";
import { sendSurveyStage } from "@/lib/survey-outreach/send-stage";
import { nextActionForRow } from "@/lib/survey-outreach/next-action";
import type { SurveyOutreachScheduleConfig } from "@/lib/survey-outreach/schedule";
import {
  claimStageSend,
  listIncompleteOutreach,
  releaseStageSendClaim,
  upsertCrmOutreachBatch,
} from "@/lib/survey-outreach/store";
import type { SurveyOutreachRow, SurveyOutreachStage } from "@/lib/survey-outreach/types";
import type { SendStageResult } from "@/lib/survey-outreach/send-stage";

export type SchedulerResult = {
  ok: true;
  sendingEnabled: boolean;
  synced: number;
  skippedNoEmail: number;
  sent: SendStageResult[];
  skipped: SendStageResult[];
  errors: { outreachId: string; stage: SurveyOutreachStage; error: string }[];
};

function isValidEmail(email: string | null | undefined): boolean {
  return Boolean(email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
}

function crmRowToOutreach(row: CrmAppointmentRow): {
  crmAppointmentId: string;
  patientEmail: string;
  patientName: string;
  appointmentDate: string;
  appointmentAt: string;
} | null {
  if (!row.id) return null;
  if (!isValidEmail(row.patient_email)) return null;

  const appointmentAt = parseCrmAppointmentAt(row.appointment_date, row.appointment_time);
  if (!appointmentAt) return null;

  return {
    crmAppointmentId: String(row.id),
    patientEmail: row.patient_email!.trim().toLowerCase(),
    patientName: (row.patient_name ?? "Patient").trim(),
    appointmentDate: (row.appointment_date ?? "").slice(0, 10),
    appointmentAt: appointmentAt.toISOString(),
  };
}

export async function syncCheckedOutFromCrm(now = new Date()): Promise<{
  synced: number;
  skippedNoEmail: number;
}> {
  const dates = crmSyncDates(now);
  const crmRows = (
    await Promise.all(dates.map((date) => fetchCrmAppointments(date, "CHK")))
  ).flat();

  const outreachRows: NonNullable<ReturnType<typeof crmRowToOutreach>>[] = [];
  let skippedNoEmail = 0;

  for (const row of crmRows) {
    const mapped = crmRowToOutreach(row);
    if (mapped) outreachRows.push(mapped);
    else skippedNoEmail++;
  }

  const { synced } = await upsertCrmOutreachBatch(outreachRows);

  return { synced, skippedNoEmail };
}

function dueStageForRow(
  row: SurveyOutreachRow,
  now: Date,
  config: SurveyOutreachScheduleConfig,
): { stage: SurveyOutreachStage; isManual: boolean } | null {
  const nextAction = nextActionForRow(row, config);
  if (!nextAction) return null;

  if (row.is_test && nextAction.stage === "initial" && !nextAction.isManual) return null;

  const dueAt = new Date(nextAction.dueAt).getTime();
  if (!Number.isFinite(dueAt) || now.getTime() < dueAt) return null;
  return { stage: nextAction.stage, isManual: nextAction.isManual };
}

function markSentInMemory(row: SurveyOutreachRow, stage: SurveyOutreachStage): void {
  const sentAt = new Date().toISOString();
  row.manual_next_scheduled_at = null;
  row.status = "sent";
  if (stage === "initial") row.initial_sent_at = sentAt;
  if (stage === "reminder1") row.reminder_1_sent_at = sentAt;
  if (stage === "reminder2") row.reminder_2_sent_at = sentAt;
  if (stage === "final") row.final_sent_at = sentAt;
}

async function sendDueForRow(
  row: SurveyOutreachRow,
  now: Date,
  schedule: SurveyOutreachScheduleConfig,
): Promise<{ sent: SendStageResult | null; skipped: SendStageResult | null; reason?: string }> {
  const dueStage = dueStageForRow(row, now, schedule);
  if (!dueStage) {
    return { sent: null, skipped: null, reason: "No due survey email for this row." };
  }

  const lockToken = crypto.randomUUID();
  const claimed = await claimStageSend({
    id: row.id,
    stage: dueStage.stage,
    lockToken,
    now: now.toISOString(),
    lockUntil: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
  });

  if (!claimed) {
    return { sent: null, skipped: null, reason: "This survey email is already being processed." };
  }

  try {
    const result = await sendSurveyStage({
      row: claimed,
      stage: dueStage.stage,
      force: dueStage.isManual && dueStage.stage === "initial",
    });
    if (result.skipped) {
      await releaseStageSendClaim(row.id, lockToken);
      return { sent: null, skipped: result };
    }
    markSentInMemory(row, dueStage.stage);
    return { sent: result, skipped: null };
  } catch (e) {
    await releaseStageSendClaim(row.id, lockToken);
    throw e;
  }
}

export async function runSurveyOutreachScheduler(now = new Date()): Promise<SchedulerResult> {
  const sendingEnabled = isSurveyOutreachSendingEnabled();
  const sent: SendStageResult[] = [];
  const skipped: SendStageResult[] = [];
  const errors: SchedulerResult["errors"] = [];

  const sync = sendingEnabled
    ? await syncCheckedOutFromCrm(now)
    : { synced: 0, skippedNoEmail: 0 };
  const schedule = await getSurveyOutreachSchedule();
  const rows = await listIncompleteOutreach();

  for (const row of rows) {
    if (!sendingEnabled && !row.is_test) continue;
    if (!sendingEnabled && row.is_test && !isScheduledTestRecipientAllowed(row.patient_email)) continue;
    const dueStage = dueStageForRow(row, now, schedule);
    if (!dueStage) continue;
    try {
      const result = await sendDueForRow(row, now, schedule);
      if (result.skipped) skipped.push(result.skipped);
      if (result.sent) sent.push(result.sent);
    } catch (e) {
      errors.push({
        outreachId: row.id,
        stage: dueStage.stage,
        error: e instanceof Error ? e.message : "Send failed",
      });
    }
  }

  return {
    ok: true,
    sendingEnabled,
    synced: sync.synced,
    skippedNoEmail: sync.skippedNoEmail,
    sent,
    skipped,
    errors,
  };
}
