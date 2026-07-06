export type SurveyOutreachScheduleConfig = {
  initialDelayHours: number;
  reminder1Days: number;
  reminder2Days: number;
  finalReminderDays: number;
};

export const INITIAL_SURVEY_MIN_DELAY_HOURS = 2;
export const INITIAL_SURVEY_MAX_DELAY_HOURS = 24;
export const REMINDER_1_DAYS_AFTER_INITIAL = 3;
export const REMINDER_2_DAYS_AFTER_INITIAL = 7;
export const FINAL_REMINDER_DAY_OPTIONS = [14, 21] as const;

function defaultFinalReminderDays(): number {
  const configured = Number(process.env.SURVEY_FINAL_REMINDER_DAYS ?? "14");
  return FINAL_REMINDER_DAY_OPTIONS.includes(configured as 14 | 21) ? configured : 14;
}

export const DEFAULT_SURVEY_OUTREACH_SCHEDULE: SurveyOutreachScheduleConfig = {
  initialDelayHours: 24,
  reminder1Days: REMINDER_1_DAYS_AFTER_INITIAL,
  reminder2Days: REMINDER_2_DAYS_AFTER_INITIAL,
  finalReminderDays: defaultFinalReminderDays(),
};

function intInRange(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeFinalReminderDays(value: unknown): number {
  const n = Number(value);
  return FINAL_REMINDER_DAY_OPTIONS.includes(n as 14 | 21)
    ? n
    : DEFAULT_SURVEY_OUTREACH_SCHEDULE.finalReminderDays;
}

export function normalizeSurveyOutreachSchedule(raw: unknown): SurveyOutreachScheduleConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    initialDelayHours: intInRange(
      o.initialDelayHours,
      DEFAULT_SURVEY_OUTREACH_SCHEDULE.initialDelayHours,
      INITIAL_SURVEY_MIN_DELAY_HOURS,
      INITIAL_SURVEY_MAX_DELAY_HOURS,
    ),
    reminder1Days: REMINDER_1_DAYS_AFTER_INITIAL,
    reminder2Days: REMINDER_2_DAYS_AFTER_INITIAL,
    finalReminderDays: normalizeFinalReminderDays(o.finalReminderDays),
  };
}

export function validateSurveyOutreachScheduleInput(raw: unknown): string | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const initialDelayHours = Number(o.initialDelayHours);
  const finalDays = Number(o.finalReminderDays);

  if (
    !Number.isInteger(initialDelayHours) ||
    initialDelayHours < INITIAL_SURVEY_MIN_DELAY_HOURS ||
    initialDelayHours > INITIAL_SURVEY_MAX_DELAY_HOURS
  ) {
    return `Initial survey must be scheduled ${INITIAL_SURVEY_MIN_DELAY_HOURS}-${INITIAL_SURVEY_MAX_DELAY_HOURS} hours after consultation.`;
  }

  if (Number(o.reminder1Days) !== REMINDER_1_DAYS_AFTER_INITIAL) {
    return `Reminder 1 must be ${REMINDER_1_DAYS_AFTER_INITIAL} days after the initial survey.`;
  }

  if (Number(o.reminder2Days) !== REMINDER_2_DAYS_AFTER_INITIAL) {
    return `Reminder 2 must be ${REMINDER_2_DAYS_AFTER_INITIAL} days after the initial survey.`;
  }

  if (!FINAL_REMINDER_DAY_OPTIONS.includes(finalDays as 14 | 21)) {
    return "Final reminder must be 14 or 21 days after the initial survey.";
  }

  return null;
}

export function scheduleDelays(config: SurveyOutreachScheduleConfig) {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  return {
    initialMs: config.initialDelayHours * hourMs,
    reminder1Ms: config.reminder1Days * dayMs,
    reminder2Ms: config.reminder2Days * dayMs,
    finalMs: config.finalReminderDays * dayMs,
  };
}

export function initialSurveyDueAt(
  appointmentAt: Date,
  config: SurveyOutreachScheduleConfig = DEFAULT_SURVEY_OUTREACH_SCHEDULE,
): Date {
  return new Date(appointmentAt.getTime() + scheduleDelays(config).initialMs);
}

export function isInitialSurveyDue(
  appointmentAt: Date,
  now = new Date(),
  config: SurveyOutreachScheduleConfig = DEFAULT_SURVEY_OUTREACH_SCHEDULE,
): boolean {
  return now.getTime() >= initialSurveyDueAt(appointmentAt, config).getTime();
}

export function isReminderDue(
  initialSentAt: Date,
  delayMs: number,
  alreadySent: boolean,
  now = new Date(),
): boolean {
  if (alreadySent) return false;
  return now.getTime() >= initialSentAt.getTime() + delayMs;
}

export function formatScheduleSummary(config: SurveyOutreachScheduleConfig = DEFAULT_SURVEY_OUTREACH_SCHEDULE): string {
  const finalWeeks = config.finalReminderDays === 21 ? "3 weeks" : "2 weeks";
  return `Initial survey: ${config.initialDelayHours} hours after consultation. Reminders: ${config.reminder1Days} days, ${config.reminder2Days} days, and ${finalWeeks} after the initial survey, only while incomplete.`;
}
