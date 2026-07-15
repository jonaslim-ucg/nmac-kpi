import { fetchCrmAppointments, crmSyncDates, type CrmAppointmentRow } from "@/lib/crm/appointments";
import {
  isProductionSurveyOutreachAfterLiveStart,
  isScheduledTestRecipientAllowed,
  surveyOutreachLiveStartAt,
} from "@/lib/survey-outreach/config";
import { parseCrmAppointmentAt } from "@/lib/survey-outreach/parse-appointment";
import {
  groupDailyOutreachAppointments,
  type DailyOutreachAppointment,
} from "@/lib/survey-outreach/daily-group";
import {
  getSurveyOutreachSchedule,
  getSurveyOutreachSendingState,
  recordSurveyOutreachSchedulerRun,
} from "@/lib/survey-outreach/schedule-settings";
import {
  DeliveryStateUncertainError,
  sendSurveyStage,
} from "@/lib/survey-outreach/send-stage";
import { nextActionForRow } from "@/lib/survey-outreach/next-action";
import type { SurveyOutreachScheduleConfig } from "@/lib/survey-outreach/schedule";
import {
  claimStageSend,
  listIncompleteOutreach,
  markStageDeliveryUncertain,
  recordStageSendFailure,
  releaseStageSendClaim,
  upsertCrmOutreachBatch,
} from "@/lib/survey-outreach/store";
import type { SurveyOutreachRow, SurveyOutreachStage } from "@/lib/survey-outreach/types";
import type { SendStageResult } from "@/lib/survey-outreach/send-stage";
import { GraphMailError } from "@/lib/graph/send-mail";
import {
  compactSendError,
  schedulerConfigurationStatus,
  surveyOutreachMaxSendsPerRun,
  surveyOutreachScanLimit,
  surveySendRetryAt,
} from "@/lib/survey-outreach/reliability";

export type SchedulerResult = {
  ok: true;
  sendingEnabled: boolean;
  sendingMasterEnabled: boolean;
  sendingAppEnabled: boolean;
  liveStartAt: string | null;
  synced: number;
  skippedNoEmail: number;
  skippedBeforeLiveStart: number;
  syncErrors: { date: string; error: string }[];
  configurationErrors: string[];
  attempted: number;
  deferredDue: number;
  sent: SendStageResult[];
  skipped: SendStageResult[];
  errors: {
    outreachId: string;
    stage: SurveyOutreachStage;
    error: string;
    retryAt: string | null;
    permanent: boolean;
  }[];
};

type SchedulerOptions = {
  allowAnyTestRecipient?: boolean;
};

class ScheduledSendFailure extends Error {
  readonly retryAt: string | null;
  readonly permanent: boolean;

  constructor(message: string, retryAt: string | null, permanent: boolean) {
    super(message);
    this.name = "ScheduledSendFailure";
    this.retryAt = retryAt;
    this.permanent = permanent;
  }
}

function isValidEmail(email: string | null | undefined): boolean {
  return Boolean(email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
}

function crmRowToOutreach(row: CrmAppointmentRow): DailyOutreachAppointment | null {
  if (!row.id) return null;
  if (!isValidEmail(row.patient_email)) return null;

  const appointmentAt = parseCrmAppointmentAt(row.appointment_date, row.appointment_time);
  if (!appointmentAt) return null;

  return {
    crmAppointmentId: String(row.id),
    patientAccNumber: row.patient_acc_number?.trim() || null,
    patientEmail: row.patient_email!.trim().toLowerCase(),
    patientName: (row.patient_name ?? "Patient").trim(),
    appointmentDate: (row.appointment_date ?? "").slice(0, 10),
    appointmentAt: appointmentAt.toISOString(),
    providerName: row.appointment_provider_name?.trim() || null,
    visitType: row.visit_type?.trim() || null,
  };
}

export async function syncCheckedOutFromCrm(now?: Date): Promise<{
  synced: number;
  skippedNoEmail: number;
  skippedBeforeLiveStart: number;
  syncErrors: { date: string; error: string }[];
}>;
export async function syncCheckedOutFromCrm(now: Date, liveStartAt: Date | string | null): Promise<{
  synced: number;
  skippedNoEmail: number;
  skippedBeforeLiveStart: number;
  syncErrors: { date: string; error: string }[];
}>;
export async function syncCheckedOutFromCrm(
  now = new Date(),
  liveStartAt: Date | string | null = surveyOutreachLiveStartAt(),
): Promise<{
  synced: number;
  skippedNoEmail: number;
  skippedBeforeLiveStart: number;
  syncErrors: { date: string; error: string }[];
}> {
  const lookbackDays = now.getUTCMinutes() % 15 === 0 ? 3 : 1;
  const dates = crmSyncDates(now, lookbackDays);
  const settled = await Promise.allSettled(
    dates.map(async (date) => ({ date, rows: await fetchCrmAppointments(date, "CHK") })),
  );
  const crmRows: CrmAppointmentRow[] = [];
  const syncErrors: { date: string; error: string }[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      crmRows.push(...result.value.rows);
      return;
    }
    syncErrors.push({
      date: dates[index],
      error: result.reason instanceof Error ? result.reason.message : "CRM sync failed.",
    });
  });

  const outreachRows: NonNullable<ReturnType<typeof crmRowToOutreach>>[] = [];
  let skippedNoEmail = 0;
  let skippedBeforeLiveStart = 0;

  for (const row of crmRows) {
    const mapped = crmRowToOutreach(row);
    if (!mapped) {
      skippedNoEmail++;
      continue;
    }
    if (!isProductionSurveyOutreachAfterLiveStart({ appointmentAt: mapped.appointmentAt, liveStartAt })) {
      skippedBeforeLiveStart++;
      continue;
    }
    outreachRows.push(mapped);
  }

  const dailyGroups = groupDailyOutreachAppointments(outreachRows);
  const { synced } = await upsertCrmOutreachBatch(dailyGroups);

  return { synced, skippedNoEmail, skippedBeforeLiveStart, syncErrors };
}

function dueStageForRow(
  row: SurveyOutreachRow,
  now: Date,
  config: SurveyOutreachScheduleConfig,
): { stage: SurveyOutreachStage; isManual: boolean } | null {
  if (row.permanently_failed_at) return null;
  if (row.next_retry_at) {
    const retryAt = new Date(row.next_retry_at).getTime();
    if (Number.isFinite(retryAt) && now.getTime() < retryAt) return null;
  }
  const nextAction = nextActionForRow(row, config);
  if (!nextAction) return null;

  if (row.is_test && nextAction.stage === "initial" && !nextAction.isManual) return null;

  const dueAt = new Date(nextAction.dueAt).getTime();
  if (!Number.isFinite(dueAt) || now.getTime() < dueAt) return null;
  return { stage: nextAction.stage, isManual: nextAction.isManual };
}

function markSentInMemory(row: SurveyOutreachRow, stage: SurveyOutreachStage, now: Date): void {
  const sentAt = now.toISOString();
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
    expectedAttemptCount: Math.max(0, row.send_attempt_count ?? 0),
  });

  if (!claimed) {
    return { sent: null, skipped: null, reason: "This survey email is already being processed." };
  }

  try {
    const result = await sendSurveyStage({
      row: claimed,
      stage: dueStage.stage,
      force: dueStage.isManual && dueStage.stage === "initial",
      lockToken,
    });
    if (result.skipped) {
      await releaseStageSendClaim(row.id, lockToken, Math.max(0, row.send_attempt_count ?? 0));
      return { sent: null, skipped: result };
    }
    markSentInMemory(row, dueStage.stage, now);
    return { sent: result, skipped: null };
  } catch (e) {
    const error = compactSendError(e, dueStage.stage);
    const graphError = e instanceof GraphMailError ? e : null;
    if (e instanceof DeliveryStateUncertainError || graphError?.deliveryUncertain) {
      try {
        await markStageDeliveryUncertain({
          id: row.id,
          stage: dueStage.stage,
          lockToken,
          error,
          now: now.toISOString(),
        });
      } catch {
        // The extended claim remains in place if persistence is unavailable.
      }
      throw new ScheduledSendFailure(error, null, true);
    }

    const retryAt = graphError?.retryable === false
      ? null
      : surveySendRetryAt({
          attempt: claimed.send_attempt_count,
          now,
          retryAfterMs: graphError?.retryAfterMs,
        });
    try {
      await recordStageSendFailure({
        id: row.id,
        stage: dueStage.stage,
        lockToken,
        error,
        retryAt: retryAt?.toISOString() ?? null,
        now: now.toISOString(),
      });
    } catch {
      await releaseStageSendClaim(row.id, lockToken).catch(() => undefined);
    }
    throw new ScheduledSendFailure(error, retryAt?.toISOString() ?? null, !retryAt);
  }
}

export async function runSurveyOutreachScheduler(
  now = new Date(),
  options: SchedulerOptions = {},
): Promise<SchedulerResult> {
  const sending = await getSurveyOutreachSendingState();
  const sendingEnabled = sending.effectiveEnabled;
  const liveStartAt = sending.liveStartAt ? new Date(sending.liveStartAt) : null;
  const sent: SendStageResult[] = [];
  const skipped: SendStageResult[] = [];
  const errors: SchedulerResult["errors"] = [];
  let attempted = 0;
  let deferredDue = 0;
  let sendCircuitOpen = false;
  const maxSends = surveyOutreachMaxSendsPerRun();
  const configuration = schedulerConfigurationStatus();
  const configurationErrors: string[] = [];
  if (!configuration.mailConfigured) {
    configurationErrors.push("Microsoft Graph mail settings are incomplete.");
  }
  if (!configuration.databaseConfigured) {
    configurationErrors.push("Supabase settings are incomplete.");
  }

  let sync = { synced: 0, skippedNoEmail: 0, skippedBeforeLiveStart: 0, syncErrors: [] as { date: string; error: string }[] };
  if (sendingEnabled && liveStartAt) {
    try {
      sync = await syncCheckedOutFromCrm(now, liveStartAt);
    } catch (error) {
      sync.syncErrors.push({
        date: "sync",
        error: error instanceof Error ? error.message : "CRM sync failed.",
      });
    }
  }
  const schedule = await getSurveyOutreachSchedule();
  const rows = await listIncompleteOutreach(surveyOutreachScanLimit());
  const productionSyncHealthy = sync.syncErrors.length === 0;

  for (const row of rows) {
    if (!sending.appEnabled) continue;
    if (!sendingEnabled && !row.is_test) continue;
    if (!row.is_test && !productionSyncHealthy) {
      if (dueStageForRow(row, now, schedule)) deferredDue++;
      continue;
    }
    if (
      !sendingEnabled &&
      row.is_test &&
      !options.allowAnyTestRecipient &&
      !isScheduledTestRecipientAllowed(row.patient_email)
    ) {
      continue;
    }
    if (
      sendingEnabled &&
      !row.is_test &&
      !isProductionSurveyOutreachAfterLiveStart({
        appointmentAt: row.appointment_at,
        createdAt: row.created_at,
        liveStartAt,
      })
    ) {
      continue;
    }
    const dueStage = dueStageForRow(row, now, schedule);
    if (!dueStage) continue;
    if (configurationErrors.length > 0) {
      deferredDue++;
      continue;
    }
    if (sendCircuitOpen) {
      deferredDue++;
      continue;
    }
    if (attempted >= maxSends) {
      deferredDue++;
      continue;
    }
    attempted++;
    try {
      const result = await sendDueForRow(row, now, schedule);
      if (result.skipped) skipped.push(result.skipped);
      if (result.sent) sent.push(result.sent);
    } catch (e) {
      sendCircuitOpen = true;
      errors.push({
        outreachId: row.id,
        stage: dueStage.stage,
        error: e instanceof Error ? e.message : "Send failed",
        retryAt: e instanceof ScheduledSendFailure ? e.retryAt : null,
        permanent: e instanceof ScheduledSendFailure ? e.permanent : false,
      });
    }
  }

  const result: SchedulerResult = {
    ok: true,
    sendingEnabled,
    sendingMasterEnabled: sending.masterEnabled,
    sendingAppEnabled: sending.appEnabled,
    liveStartAt: sending.liveStartAt,
    synced: sync.synced,
    skippedNoEmail: sync.skippedNoEmail,
    skippedBeforeLiveStart: sync.skippedBeforeLiveStart,
    syncErrors: sync.syncErrors,
    configurationErrors,
    attempted,
    deferredDue,
    sent,
    skipped,
    errors,
  };

  await recordSurveyOutreachSchedulerRun({
    at: now.toISOString(),
    successful:
      configurationErrors.length === 0 && sync.syncErrors.length === 0 && errors.length === 0,
    error:
      configurationErrors[0] ?? errors[0]?.error ?? sync.syncErrors[0]?.error ?? null,
    result: {
      sent: sent.length,
      skipped: skipped.length,
      errors: errors.length + configurationErrors.length,
      syncErrors: sync.syncErrors.length,
      deferredDue,
    },
  }).catch(() => undefined);

  return result;
}
