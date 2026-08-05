/** Patient survey emails are off unless SURVEY_OUTREACH_SEND_EMAILS=true. */
export function isSurveyOutreachSendingEnabled(): boolean {
  return process.env.SURVEY_OUTREACH_SEND_EMAILS?.trim().toLowerCase() === "true";
}

export function surveyOutreachLiveStartAt(): Date | null {
  const raw =
    process.env.SURVEY_OUTREACH_LIVE_START_AT?.trim() ||
    process.env.SURVEY_OUTREACH_GO_LIVE_AT?.trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeLiveStartAt(value?: Date | string | null): Date | null {
  if (!value) return surveyOutreachLiveStartAt();
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : surveyOutreachLiveStartAt();
}

export function isProductionSurveyOutreachAfterLiveStart(input: {
  appointmentAt: string | null;
  createdAt?: string | null;
  liveStartAt?: Date | string | null;
}): boolean {
  const liveStartAt = normalizeLiveStartAt(input.liveStartAt);
  if (!liveStartAt) return false;

  const appointmentAt = input.appointmentAt ? new Date(input.appointmentAt) : null;
  if (!appointmentAt || !Number.isFinite(appointmentAt.getTime())) return false;
  if (appointmentAt.getTime() < liveStartAt.getTime()) return false;

  if (input.createdAt) {
    const createdAt = new Date(input.createdAt);
    if (Number.isFinite(createdAt.getTime()) && createdAt.getTime() < liveStartAt.getTime()) {
      return false;
    }
  }

  return true;
}

/**
 * Once an initial survey has been sent, pausing and resuming the app switch
 * must not move that survey chain outside the live cohort. The live-start
 * cutoff still applies to every initial survey that has not been sent yet.
 */
export function isProductionSurveyOutreachInActiveCohort(input: {
  appointmentAt: string | null;
  createdAt?: string | null;
  initialSentAt?: string | null;
  liveStartAt?: Date | string | null;
}): boolean {
  if (input.initialSentAt) {
    const initialSentAt = new Date(input.initialSentAt);
    if (Number.isFinite(initialSentAt.getTime())) return true;
  }

  return isProductionSurveyOutreachAfterLiveStart(input);
}

export function isScheduledTestRecipientAllowed(email: string): boolean {
  const raw = process.env.SURVEY_OUTREACH_TEST_EMAILS?.trim() || "kim.ramirez@ucg.bm";
  const allowed = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export function surveyOutreachSendingDisabledReason(): string {
  return "Survey email sending is disabled. Set SURVEY_OUTREACH_SEND_EMAILS=true when ready to go live.";
}

export function surveyOutreachAppDisabledReason(): string {
  return "Survey sending is turned off in the Survey outreach page.";
}

export function surveyOutreachLiveStartMissingReason(): string {
  return "Live survey sending requires SURVEY_OUTREACH_LIVE_START_AT so old checked-out visits are not emailed.";
}

export function surveyOutreachBeforeLiveStartReason(liveStartAtInput?: Date | string | null): string {
  const liveStartAt = normalizeLiveStartAt(liveStartAtInput);
  if (!liveStartAt) return surveyOutreachLiveStartMissingReason();
  return `Survey outreach is limited to visits at or after ${liveStartAt.toISOString()}.`;
}
