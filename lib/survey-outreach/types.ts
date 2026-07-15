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
  crm_appointment_ids: string[];
  patient_acc_number: string | null;
  outreach_group_key: string | null;
  merged_into_outreach_id: string | null;
  patient_email: string;
  patient_name: string;
  appointment_date: string | null;
  appointment_at: string | null;
  provider_names: string[];
  visit_types: string[];
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
  last_delivery_key: string | null;
  send_attempt_count: number;
  last_send_attempt_at: string | null;
  next_retry_at: string | null;
  last_send_error: string | null;
  failed_stage: SurveyOutreachStage | null;
  permanently_failed_at: string | null;
  status: "pending" | "sent" | "completed" | "skipped" | "failed";
  recalled_at: string | null;
  recall_reason: string | null;
};

export type SurveyOutreachLookup = {
  email: string;
  patientName: string;
  completed: boolean;
  appointmentCount: number;
  providerNames: string[];
};
