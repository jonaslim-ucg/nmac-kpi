import { APP_SETTINGS_ID } from "@/lib/auth/app-settings";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  DEFAULT_SURVEY_MONTHLY_REPORT_CONFIG,
  normalizeSurveyMonthlyReportConfig,
  type SurveyMonthlyReportConfig,
} from "@/lib/survey-outreach/monthly-report-config";

export type SurveyMonthlyReportRunResult = {
  periodKey: string;
  periodLabel: string;
  sent: number;
  skipped: number;
  errors: number;
  recipients: number;
};

export type SurveyMonthlyReportHealth = {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastResult: SurveyMonthlyReportRunResult | null;
};

export type SurveyMonthlyReportDelivery = {
  id: string;
  periodKey: string;
  recipientEmail: string;
  recipientName: string;
  status: "sending" | "sent" | "failed";
  sentAt: string | null;
  error: string | null;
  createdAt: string;
};

type MonthlyReportState = {
  config: SurveyMonthlyReportConfig;
  health: SurveyMonthlyReportHealth;
  deliveries: SurveyMonthlyReportDelivery[];
};

type SettingsRow = {
  survey_outreach_schedule: unknown;
  updated_at: string;
};

type Mutation<T> = {
  changed: boolean;
  state: MonthlyReportState;
  result: T;
};

const EMPTY_HEALTH: SurveyMonthlyReportHealth = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastResult: null,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeHealth(value: unknown): SurveyMonthlyReportHealth {
  if (!isObject(value)) return { ...EMPTY_HEALTH };
  return {
    lastRunAt: typeof value.lastRunAt === "string" ? value.lastRunAt : null,
    lastSuccessAt: typeof value.lastSuccessAt === "string" ? value.lastSuccessAt : null,
    lastError: typeof value.lastError === "string" ? value.lastError : null,
    lastResult: isObject(value.lastResult)
      ? (value.lastResult as SurveyMonthlyReportRunResult)
      : null,
  };
}

function normalizeDelivery(value: unknown): SurveyMonthlyReportDelivery | null {
  if (!isObject(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.periodKey !== "string" ||
    typeof value.recipientEmail !== "string" ||
    typeof value.recipientName !== "string" ||
    !["sending", "sent", "failed"].includes(String(value.status)) ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    periodKey: value.periodKey,
    recipientEmail: value.recipientEmail,
    recipientName: value.recipientName,
    status: value.status as SurveyMonthlyReportDelivery["status"],
    sentAt: typeof value.sentAt === "string" ? value.sentAt : null,
    error: typeof value.error === "string" ? value.error : null,
    createdAt: value.createdAt,
  };
}

function stateFromSchedule(value: unknown): MonthlyReportState {
  const schedule = isObject(value) ? value : {};
  const saved = isObject(schedule.monthlyManagerReport) ? schedule.monthlyManagerReport : {};
  return {
    config: normalizeSurveyMonthlyReportConfig(
      saved.config ?? DEFAULT_SURVEY_MONTHLY_REPORT_CONFIG,
    ),
    health: normalizeHealth(saved.health),
    deliveries: Array.isArray(saved.deliveries)
      ? saved.deliveries
          .map(normalizeDelivery)
          .filter((item): item is SurveyMonthlyReportDelivery => Boolean(item))
      : [],
  };
}

async function readSettingsRow(): Promise<SettingsRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("survey_outreach_schedule,updated_at")
    .eq("id", APP_SETTINGS_ID)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Could not load monthly survey report settings.");
  }
  return data as SettingsRow;
}

async function mutateMonthlyReportState<T>(
  mutate: (state: MonthlyReportState) => Mutation<T>,
): Promise<T> {
  const supabase = createServiceRoleClient();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const row = await readSettingsRow();
    const currentSchedule = isObject(row.survey_outreach_schedule)
      ? row.survey_outreach_schedule
      : {};
    const mutation = mutate(stateFromSchedule(currentSchedule));
    if (!mutation.changed) return mutation.result;

    const { data, error } = await supabase
      .from("app_settings")
      .update({
        survey_outreach_schedule: {
          ...currentSchedule,
          monthlyManagerReport: mutation.state,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", APP_SETTINGS_ID)
      .eq("updated_at", row.updated_at)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return mutation.result;
  }
  throw new Error("Monthly report settings changed at the same time. Please try again.");
}

export async function getSurveyMonthlyReportConfig(): Promise<SurveyMonthlyReportConfig> {
  return stateFromSchedule((await readSettingsRow()).survey_outreach_schedule).config;
}

export async function updateSurveyMonthlyReportConfig(
  input: SurveyMonthlyReportConfig,
): Promise<SurveyMonthlyReportConfig> {
  const config = normalizeSurveyMonthlyReportConfig(input);
  return mutateMonthlyReportState((state) => ({
    changed: true,
    state: { ...state, config },
    result: config,
  }));
}

export async function getSurveyMonthlyReportHealth(): Promise<SurveyMonthlyReportHealth> {
  return stateFromSchedule((await readSettingsRow()).survey_outreach_schedule).health;
}

export async function recordSurveyMonthlyReportRun(input: {
  at: string;
  successful: boolean;
  error: string | null;
  result: SurveyMonthlyReportRunResult;
}): Promise<void> {
  await mutateMonthlyReportState((state) => ({
    changed: true,
    state: {
      ...state,
      health: {
        lastRunAt: input.at,
        lastSuccessAt: input.successful ? input.at : state.health.lastSuccessAt,
        lastError: input.error,
        lastResult: input.result,
      },
    },
    result: undefined,
  }));
}

export async function listSurveyMonthlyReportDeliveries(
  limit = 12,
): Promise<SurveyMonthlyReportDelivery[]> {
  return stateFromSchedule((await readSettingsRow()).survey_outreach_schedule)
    .deliveries
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.min(Math.max(limit, 1), 50));
}

export async function claimSurveyMonthlyReportDelivery(input: {
  periodKey: string;
  recipientEmail: string;
  recipientName: string;
}): Promise<SurveyMonthlyReportDelivery | null> {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  return mutateMonthlyReportState((state) => {
    const exists = state.deliveries.some(
      (delivery) =>
        delivery.periodKey === input.periodKey &&
        delivery.recipientEmail === recipientEmail,
    );
    if (exists) return { changed: false, state, result: null };

    const delivery: SurveyMonthlyReportDelivery = {
      id: crypto.randomUUID(),
      periodKey: input.periodKey,
      recipientEmail,
      recipientName: input.recipientName.trim(),
      status: "sending",
      sentAt: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
    return {
      changed: true,
      state: { ...state, deliveries: [delivery, ...state.deliveries].slice(0, 120) },
      result: delivery,
    };
  });
}

export async function completeSurveyMonthlyReportDelivery(input: {
  id: string;
  sent: boolean;
  error?: string | null;
}): Promise<void> {
  await mutateMonthlyReportState((state) => {
    const exists = state.deliveries.some((delivery) => delivery.id === input.id);
    if (!exists) return { changed: false, state, result: undefined };
    const now = new Date().toISOString();
    return {
      changed: true,
      state: {
        ...state,
        deliveries: state.deliveries.map((delivery) =>
          delivery.id === input.id
            ? {
                ...delivery,
                status: input.sent ? "sent" : "failed",
                sentAt: input.sent ? now : null,
                error: input.error ?? null,
              }
            : delivery,
        ),
      },
      result: undefined,
    };
  });
}
