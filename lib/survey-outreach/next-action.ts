import {
  initialSurveyDueAt,
  noEarlierThanMinimumMessageGap,
  scheduleDelays,
  type SurveyOutreachScheduleConfig,
} from "@/lib/survey-outreach/schedule";
import {
  getSurveyOutreachSchedule,
  getSurveyOutreachSendingState,
} from "@/lib/survey-outreach/schedule-settings";
import { listIncompleteOutreach } from "@/lib/survey-outreach/store";
import type { SurveyOutreachRow, SurveyOutreachStage } from "@/lib/survey-outreach/types";
import { isProductionSurveyOutreachAfterLiveStart } from "@/lib/survey-outreach/config";

export type NextOutreachAction = {
  outreachId: string;
  stage: SurveyOutreachStage;
  dueAt: string;
  isManual: boolean;
  patientEmail: string;
  patientName: string;
  isTest: boolean;
  appointmentDate: string | null;
};

export function nextActionForRow(
  row: SurveyOutreachRow,
  schedule: SurveyOutreachScheduleConfig,
): NextOutreachAction | null {
  if (row.completed_at || row.recalled_at) return null;

  const delays = scheduleDelays(schedule);

  if (!row.initial_sent_at) {
    if (!row.appointment_at) return null;
    const manualDueAt = row.manual_next_scheduled_at ? new Date(row.manual_next_scheduled_at) : null;
    const dueAt = manualDueAt && Number.isFinite(manualDueAt.getTime())
      ? manualDueAt
      : initialSurveyDueAt(new Date(row.appointment_at), schedule);
    return {
      outreachId: row.id,
      stage: "initial",
      dueAt: dueAt.toISOString(),
      isManual: dueAt === manualDueAt,
      patientEmail: row.patient_email,
      patientName: row.patient_name,
      isTest: row.is_test,
      appointmentDate: row.appointment_date,
    };
  }

  const initialSentAt = new Date(row.initial_sent_at);

  const candidates: { stage: SurveyOutreachStage; dueAt: Date }[] = [];
  if (!row.reminder_1_sent_at) {
    candidates.push({
      stage: "reminder1",
      dueAt: noEarlierThanMinimumMessageGap(
        new Date(initialSentAt.getTime() + delays.reminder1Ms),
        initialSentAt,
      ),
    });
  }
  if (!row.reminder_2_sent_at) {
    candidates.push({
      stage: "reminder2",
      dueAt: noEarlierThanMinimumMessageGap(
        new Date(initialSentAt.getTime() + delays.reminder2Ms),
        row.reminder_1_sent_at ? new Date(row.reminder_1_sent_at) : initialSentAt,
      ),
    });
  }
  if (!row.final_sent_at) {
    candidates.push({
      stage: "final",
      dueAt: noEarlierThanMinimumMessageGap(
        new Date(initialSentAt.getTime() + delays.finalMs),
        row.reminder_2_sent_at
          ? new Date(row.reminder_2_sent_at)
          : row.reminder_1_sent_at
            ? new Date(row.reminder_1_sent_at)
            : initialSentAt,
      ),
    });
  }

  const next = candidates.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
  if (!next) return null;
  const manualDueAt = row.manual_next_scheduled_at ? new Date(row.manual_next_scheduled_at) : null;
  const dueAt = manualDueAt && Number.isFinite(manualDueAt.getTime()) ? manualDueAt : next.dueAt;

  return {
    outreachId: row.id,
    stage: next.stage,
    dueAt: dueAt.toISOString(),
    isManual: dueAt === manualDueAt,
    patientEmail: row.patient_email,
    patientName: row.patient_name,
    isTest: row.is_test,
    appointmentDate: row.appointment_date,
  };
}

export async function getNextSurveyOutreachActions(): Promise<{
  sendingEnabled: boolean;
  sendingMasterEnabled: boolean;
  sendingAppEnabled: boolean;
  liveStartAt: string | null;
  pendingCount: number;
  next: NextOutreachAction | null;
  upcoming: NextOutreachAction[];
}> {
  const sending = await getSurveyOutreachSendingState();
  const sendingEnabled = sending.effectiveEnabled;
  const schedule = await getSurveyOutreachSchedule();
  const rows = await listIncompleteOutreach();
  const actions = rows
    .filter(
      (row) =>
        !sendingEnabled ||
        row.is_test ||
        isProductionSurveyOutreachAfterLiveStart({
          appointmentAt: row.appointment_at,
          createdAt: row.created_at,
          liveStartAt: sending.liveStartAt,
        }),
    )
    .map((row) => nextActionForRow(row, schedule))
    .filter((a): a is NextOutreachAction => a !== null)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  return {
    sendingEnabled,
    sendingMasterEnabled: sending.masterEnabled,
    sendingAppEnabled: sending.appEnabled,
    liveStartAt: sending.liveStartAt,
    pendingCount: actions.length,
    next: actions[0] ?? null,
    upcoming: actions.slice(0, 10),
  };
}

export function stageLabel(stage: SurveyOutreachStage): string {
  switch (stage) {
    case "initial":
      return "Initial survey";
    case "reminder1":
      return "Reminder 1";
    case "reminder2":
      return "Reminder 2";
    case "final":
      return "Final reminder";
  }
}
