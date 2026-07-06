export type SurveyOutreachStage = "initial" | "reminder1" | "reminder2" | "final";

export const SURVEY_OUTREACH_STAGES: SurveyOutreachStage[] = [
  "initial",
  "reminder1",
  "reminder2",
  "final",
];

export type SurveyOutreachRow = {
  id: string;
  created_at: string;
  survey_token: string;
  crm_appointment_id: string | null;
  patient_email: string;
  patient_name: string;
  appointment_date: string | null;
  appointment_at: string | null;
  is_test: boolean;
  initial_sent_at: string | null;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  final_sent_at: string | null;
  manual_next_scheduled_at: string | null;
  completed_at: string | null;
  send_lock_token: string | null;
  send_lock_stage: SurveyOutreachStage | null;
  send_lock_until: string | null;
  status: "pending" | "sent" | "completed" | "skipped";
  recalled_at: string | null;
  recall_reason: string | null;
};

export type SurveyOutreachLookup = {
  email: string;
  patientName: string;
  completed: boolean;
};
