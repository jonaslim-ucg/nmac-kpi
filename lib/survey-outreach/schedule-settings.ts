import { createServiceRoleClient } from "@/lib/supabase/admin";
import { APP_SETTINGS_ID } from "@/lib/auth/app-settings";
import {
  isSurveyOutreachSendingEnabled,
  surveyOutreachLiveStartAt,
} from "@/lib/survey-outreach/config";
import {
  DEFAULT_SURVEY_OUTREACH_SCHEDULE,
  normalizeSurveyOutreachSchedule,
  type SurveyOutreachScheduleConfig,
} from "@/lib/survey-outreach/schedule";

export type { SurveyOutreachScheduleConfig };

export type SurveyOutreachSendingState = {
  masterEnabled: boolean;
  appEnabled: boolean;
  effectiveEnabled: boolean;
  liveStartAt: string | null;
};

function sendingState(appEnabled: boolean): SurveyOutreachSendingState {
  const masterEnabled = isSurveyOutreachSendingEnabled();
  const liveStartAt = surveyOutreachLiveStartAt();
  return {
    masterEnabled,
    appEnabled,
    effectiveEnabled: masterEnabled && appEnabled,
    liveStartAt: liveStartAt?.toISOString() ?? null,
  };
}

export async function getSurveyOutreachSchedule(): Promise<SurveyOutreachScheduleConfig> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("survey_outreach_schedule")
    .eq("id", APP_SETTINGS_ID)
    .maybeSingle();

  if (error || !data?.survey_outreach_schedule) {
    return DEFAULT_SURVEY_OUTREACH_SCHEDULE;
  }

  return normalizeSurveyOutreachSchedule(data.survey_outreach_schedule);
}

export async function updateSurveyOutreachSchedule(
  input: SurveyOutreachScheduleConfig,
): Promise<SurveyOutreachScheduleConfig> {
  const schedule = normalizeSurveyOutreachSchedule(input);
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_settings")
    .update({
      survey_outreach_schedule: schedule,
      updated_at: new Date().toISOString(),
    })
    .eq("id", APP_SETTINGS_ID)
    .select("survey_outreach_schedule")
    .single();

  if (error || !data?.survey_outreach_schedule) {
    throw new Error(error?.message ?? "Could not save survey outreach schedule.");
  }

  return normalizeSurveyOutreachSchedule(data.survey_outreach_schedule);
}

export async function getSurveyOutreachSendingState(): Promise<SurveyOutreachSendingState> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("survey_outreach_sending_enabled")
    .eq("id", APP_SETTINGS_ID)
    .maybeSingle();

  if (error) return sendingState(false);
  return sendingState(Boolean(data?.survey_outreach_sending_enabled));
}

export async function updateSurveyOutreachSendingEnabled(
  enabled: boolean,
): Promise<SurveyOutreachSendingState> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_settings")
    .update({
      survey_outreach_sending_enabled: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", APP_SETTINGS_ID)
    .select("survey_outreach_sending_enabled")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not update survey sending setting.");
  }

  return sendingState(Boolean(data.survey_outreach_sending_enabled));
}
