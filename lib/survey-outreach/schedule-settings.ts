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
import { schedulerConfigurationStatus } from "@/lib/survey-outreach/reliability";

export type { SurveyOutreachScheduleConfig };

export type SurveyOutreachSendingState = {
  masterEnabled: boolean;
  appEnabled: boolean;
  effectiveEnabled: boolean;
  liveStartAt: string | null;
  appEnabledAt: string | null;
};

export type SurveyOutreachSchedulerHealth = ReturnType<typeof schedulerConfigurationStatus> & {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  failedRows: number;
  lastResult: {
    sent: number;
    skipped: number;
    errors: number;
    syncErrors: number;
    deferredDue: number;
  } | null;
};

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function latestDate(...dates: (Date | null)[]): Date | null {
  return dates.reduce<Date | null>((latest, date) => {
    if (!date) return latest;
    if (!latest || date.getTime() > latest.getTime()) return date;
    return latest;
  }, null);
}

function sendingState(appEnabled: boolean, appEnabledAtInput: unknown = null): SurveyOutreachSendingState {
  const masterEnabled = isSurveyOutreachSendingEnabled();
  const appEnabledAt = parseDate(appEnabledAtInput);
  const liveStartAt = appEnabled ? latestDate(surveyOutreachLiveStartAt(), appEnabledAt) : null;
  return {
    masterEnabled,
    appEnabled,
    effectiveEnabled: masterEnabled && appEnabled,
    liveStartAt: liveStartAt?.toISOString() ?? null,
    appEnabledAt: appEnabledAt?.toISOString() ?? null,
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
    .select("survey_outreach_sending_enabled,survey_outreach_sending_enabled_at")
    .eq("id", APP_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    const fallback = await supabase
      .from("app_settings")
      .select("survey_outreach_sending_enabled")
      .eq("id", APP_SETTINGS_ID)
      .maybeSingle();
    if (fallback.error) return sendingState(false);
    return sendingState(Boolean(fallback.data?.survey_outreach_sending_enabled));
  }
  return sendingState(
    Boolean(data?.survey_outreach_sending_enabled),
    data?.survey_outreach_sending_enabled_at,
  );
}

export async function updateSurveyOutreachSendingEnabled(
  enabled: boolean,
): Promise<SurveyOutreachSendingState> {
  const supabase = createServiceRoleClient();
  const current = await getSurveyOutreachSendingState();
  const enabledAt = enabled
    ? current.appEnabled && current.appEnabledAt
      ? current.appEnabledAt
      : new Date().toISOString()
    : null;
  const { data, error } = await supabase
    .from("app_settings")
    .update({
      survey_outreach_sending_enabled: enabled,
      survey_outreach_sending_enabled_at: enabledAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", APP_SETTINGS_ID)
    .select("survey_outreach_sending_enabled,survey_outreach_sending_enabled_at")
    .single();

  if (error || !data) {
    const fallback = await supabase
      .from("app_settings")
      .update({
        survey_outreach_sending_enabled: enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", APP_SETTINGS_ID)
      .select("survey_outreach_sending_enabled")
      .single();
    if (fallback.error || !fallback.data) {
      throw new Error(error?.message ?? "Could not update survey sending setting.");
    }
    return sendingState(Boolean(fallback.data.survey_outreach_sending_enabled));
  }

  return sendingState(
    Boolean(data.survey_outreach_sending_enabled),
    data.survey_outreach_sending_enabled_at,
  );
}

export async function getSurveyOutreachSchedulerHealth(): Promise<SurveyOutreachSchedulerHealth> {
  const configuration = schedulerConfigurationStatus();
  const supabase = createServiceRoleClient();
  const [{ data, error }, { count: failedRows }] = await Promise.all([
    supabase
      .from("app_settings")
      .select(
        "survey_outreach_last_run_at,survey_outreach_last_success_at,survey_outreach_last_error,survey_outreach_last_result",
      )
      .eq("id", APP_SETTINGS_ID)
      .maybeSingle(),
    supabase
      .from("survey_outreach")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);

  if (error || !data) {
    return {
      ...configuration,
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      failedRows: failedRows ?? 0,
      lastResult: null,
    };
  }

  const result = data.survey_outreach_last_result;
  return {
    ...configuration,
    lastRunAt: parseDate(data.survey_outreach_last_run_at)?.toISOString() ?? null,
    lastSuccessAt: parseDate(data.survey_outreach_last_success_at)?.toISOString() ?? null,
    lastError:
      typeof data.survey_outreach_last_error === "string"
        ? data.survey_outreach_last_error
        : null,
    failedRows: failedRows ?? 0,
    lastResult:
      result && typeof result === "object"
        ? (result as SurveyOutreachSchedulerHealth["lastResult"])
        : null,
  };
}

export async function recordSurveyOutreachSchedulerRun(input: {
  at: string;
  successful: boolean;
  error: string | null;
  result: NonNullable<SurveyOutreachSchedulerHealth["lastResult"]>;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      survey_outreach_last_run_at: input.at,
      ...(input.successful ? { survey_outreach_last_success_at: input.at } : {}),
      survey_outreach_last_error: input.error,
      survey_outreach_last_result: input.result,
    })
    .eq("id", APP_SETTINGS_ID);
  if (error) throw new Error(error.message);
}
