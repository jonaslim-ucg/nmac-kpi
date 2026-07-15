import { buildSurveyEmail } from "@/lib/survey-outreach/emails";
import {
  isProductionSurveyOutreachAfterLiveStart,
  surveyOutreachAppDisabledReason,
  surveyOutreachBeforeLiveStartReason,
  surveyOutreachSendingDisabledReason,
} from "@/lib/survey-outreach/config";
import {
  initialSurveyDueAt,
  isInitialSurveyDue,
} from "@/lib/survey-outreach/schedule";
import {
  getSurveyOutreachSchedule,
  getSurveyOutreachSendingState,
} from "@/lib/survey-outreach/schedule-settings";
import {
  createTestOutreach,
  extendStageSendClaim,
  getActiveTestOutreach,
  getClaimedOutreach,
  getOutreachById,
  getOutreachByToken,
  markOutreachRecalled,
  markStageSent,
  resetTestOutreach,
} from "@/lib/survey-outreach/store";
import type { SurveyOutreachRow, SurveyOutreachStage } from "@/lib/survey-outreach/types";
import { isSurveyEmailSuppressed } from "@/lib/survey-outreach/recall";
import { buildSurveyUrl } from "@/lib/survey-outreach/urls";
import { sendMailViaGraph } from "@/lib/graph/send-mail";

const DELIVERY_UNCERTAINTY_LOCK_MS = 2 * 60 * 60 * 1000;

export class DeliveryStateUncertainError extends Error {
  readonly deliveryAccepted = true;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DeliveryStateUncertainError";
  }
}

async function persistStageSent(
  id: string,
  stage: SurveyOutreachStage,
  lockToken?: string,
): Promise<void> {
  let lastError: unknown;
  for (const delayMs of [0, 150, 500]) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      await markStageSent(id, stage, lockToken);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export type SendStageResult = {
  ok: true;
  stage: SurveyOutreachStage;
  to: string;
  surveyUrl: string;
  outreachId: string;
  skipped?: boolean;
  reason?: string;
};

export async function sendSurveyStage(input: {
  row: SurveyOutreachRow;
  stage: SurveyOutreachStage;
  force?: boolean;
  lockToken?: string;
}): Promise<SendStageResult> {
  const { stage, force = false, lockToken } = input;
  let row = input.row;

  if (lockToken) {
    const current = await getClaimedOutreach(row.id, lockToken, stage);
    if (!current) {
      const latest = await getOutreachById(row.id);
      return {
        ok: true,
        stage,
        to: row.patient_email,
        surveyUrl: buildSurveyUrl(row.survey_token),
        outreachId: row.id,
        skipped: true,
        reason: latest?.completed_at
          ? "Survey was completed before delivery."
          : latest?.recalled_at
            ? "Survey outreach was recalled before delivery."
            : "The delivery claim is no longer active.",
      };
    }
    row = current;
  }

  if (row.completed_at) {
    return {
      ok: true,
      stage,
      to: row.patient_email,
      surveyUrl: buildSurveyUrl(row.survey_token),
      outreachId: row.id,
      skipped: true,
      reason: "Survey already completed.",
    };
  }

  const suppressed = !row.is_test && !row.recalled_at
    ? await isSurveyEmailSuppressed(row.patient_email)
    : false;
  if (row.recalled_at || suppressed) {
    const reason = row.recall_reason ?? "Survey outreach is suppressed for this patient.";
    if (suppressed) {
      await markOutreachRecalled(row.id, reason, lockToken);
    }
    return {
      ok: true,
      stage,
      to: row.patient_email,
      surveyUrl: buildSurveyUrl(row.survey_token),
      outreachId: row.id,
      skipped: true,
      reason,
    };
  }

  const alreadySent =
    (stage === "initial" && row.initial_sent_at) ||
    (stage === "reminder1" && row.reminder_1_sent_at) ||
    (stage === "reminder2" && row.reminder_2_sent_at) ||
    (stage === "final" && row.final_sent_at);

  if (alreadySent && !force) {
    return {
      ok: true,
      stage,
      to: row.patient_email,
      surveyUrl: buildSurveyUrl(row.survey_token),
      outreachId: row.id,
      skipped: true,
      reason: `${stage} was already sent. Use force=true to resend.`,
    };
  }

  if (stage !== "initial" && !row.initial_sent_at) {
    throw new Error("Initial survey must be sent before reminders.");
  }

  if (
    stage === "initial" &&
    !force &&
    !row.is_test &&
    row.appointment_at
  ) {
    const schedule = await getSurveyOutreachSchedule();
    if (!isInitialSurveyDue(new Date(row.appointment_at), new Date(), schedule)) {
      const dueAt = initialSurveyDueAt(new Date(row.appointment_at), schedule);
      return {
        ok: true,
        stage,
        to: row.patient_email,
        surveyUrl: buildSurveyUrl(row.survey_token),
        outreachId: row.id,
        skipped: true,
        reason: `Initial survey is scheduled for ${dueAt.toISOString()} (${schedule.initialDelayHours} hours after the patient's last appointment of the day).`,
      };
    }
  }

  const sending = await getSurveyOutreachSendingState();
  if (!sending.appEnabled) {
    return {
      ok: true,
      stage,
      to: row.patient_email,
      surveyUrl: buildSurveyUrl(row.survey_token),
      outreachId: row.id,
      skipped: true,
      reason: surveyOutreachAppDisabledReason(),
    };
  }

  if (!row.is_test && !sending.effectiveEnabled) {
    return {
      ok: true,
      stage,
      to: row.patient_email,
      surveyUrl: buildSurveyUrl(row.survey_token),
      outreachId: row.id,
      skipped: true,
      reason: sending.masterEnabled
        ? surveyOutreachAppDisabledReason()
        : surveyOutreachSendingDisabledReason(),
    };
  }

  if (
    !row.is_test &&
    !isProductionSurveyOutreachAfterLiveStart({
      appointmentAt: row.appointment_at,
      createdAt: row.created_at,
      liveStartAt: sending.liveStartAt,
    })
  ) {
    return {
      ok: true,
      stage,
      to: row.patient_email,
      surveyUrl: buildSurveyUrl(row.survey_token),
      outreachId: row.id,
      skipped: true,
      reason: surveyOutreachBeforeLiveStartReason(sending.liveStartAt),
    };
  }

  const { subject, textBody, htmlBody } = buildSurveyEmail(
    stage,
    row.patient_name,
    row.survey_token,
    Math.max(row.crm_appointment_ids?.length ?? 0, 1),
  );
  if (lockToken) {
    await extendStageSendClaim({
      id: row.id,
      stage,
      lockToken,
      lockUntil: new Date(Date.now() + DELIVERY_UNCERTAINTY_LOCK_MS).toISOString(),
    });
  }

  await sendMailViaGraph({
    to: row.patient_email,
    subject,
    textBody,
    htmlBody,
    deliveryKey: lockToken ?? crypto.randomUUID(),
  });
  try {
    await persistStageSent(row.id, stage, lockToken);
  } catch (error) {
    throw new DeliveryStateUncertainError(
      "Microsoft Graph accepted the email, but its sent status could not be saved. Automatic retry was stopped to prevent a duplicate.",
      { cause: error },
    );
  }

  return {
    ok: true,
    stage,
    to: row.patient_email,
    surveyUrl: buildSurveyUrl(row.survey_token),
    outreachId: row.id,
  };
}

export async function sendTestSurveyStage(input: {
  email: string;
  patientName: string;
  stage: SurveyOutreachStage;
  force?: boolean;
  reset?: boolean;
  appointmentFinishedAt?: string;
}): Promise<SendStageResult> {
  if (input.reset) {
    await resetTestOutreach(input.email);
  }

  let row = input.reset ? null : await getActiveTestOutreach(input.email);
  if (!row) {
    row = await createTestOutreach({
      email: input.email,
      patientName: input.patientName,
      appointmentFinishedAt: input.appointmentFinishedAt,
    });
  }

  return sendSurveyStage({
    row,
    stage: input.stage,
    force: input.force ?? !input.appointmentFinishedAt,
  });
}

export async function getOutreachRowForToken(token: string): Promise<SurveyOutreachRow | null> {
  return getOutreachByToken(token);
}
