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
  getActiveTestOutreach,
  getOutreachByToken,
  markStageSent,
  resetTestOutreach,
} from "@/lib/survey-outreach/store";
import type { SurveyOutreachRow, SurveyOutreachStage } from "@/lib/survey-outreach/types";
import { isSurveyEmailSuppressed } from "@/lib/survey-outreach/recall";
import { buildSurveyUrl } from "@/lib/survey-outreach/urls";
import { sendMailViaGraph } from "@/lib/graph/send-mail";

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
}): Promise<SendStageResult> {
  const { row, stage, force = false } = input;

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

  if (row.recalled_at || (!row.is_test && (await isSurveyEmailSuppressed(row.patient_email)))) {
    return {
      ok: true,
      stage,
      to: row.patient_email,
      surveyUrl: buildSurveyUrl(row.survey_token),
      outreachId: row.id,
      skipped: true,
      reason: row.recall_reason ?? "Survey outreach recalled for this patient.",
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
        reason: `Initial survey is scheduled for ${dueAt.toISOString()} (${schedule.initialDelayHours} hours after consultation).`,
      };
    }
  }

  const sending = row.is_test ? null : await getSurveyOutreachSendingState();
  if (sending && !sending.effectiveEnabled) {
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
    })
  ) {
    return {
      ok: true,
      stage,
      to: row.patient_email,
      surveyUrl: buildSurveyUrl(row.survey_token),
      outreachId: row.id,
      skipped: true,
      reason: surveyOutreachBeforeLiveStartReason(),
    };
  }

  const { subject, textBody } = buildSurveyEmail(stage, row.patient_name, row.survey_token);
  await sendMailViaGraph({ to: row.patient_email, subject, textBody });
  await markStageSent(row.id, stage);

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
