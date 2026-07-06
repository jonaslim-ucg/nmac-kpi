/** Patient survey emails are off unless SURVEY_OUTREACH_SEND_EMAILS=true. */
export function isSurveyOutreachSendingEnabled(): boolean {
  return process.env.SURVEY_OUTREACH_SEND_EMAILS?.trim().toLowerCase() === "true";
}

export function isScheduledTestRecipientAllowed(email: string): boolean {
  const raw = process.env.SURVEY_OUTREACH_TEST_EMAILS?.trim() || "kim.ramirez@ucg.bm";
  const allowed = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

/** One-off apology emails are off unless SURVEY_APOLOGY_SEND_ENABLED=true. */
export function isSurveyApologySendingEnabled(): boolean {
  return process.env.SURVEY_APOLOGY_SEND_ENABLED?.trim().toLowerCase() === "true";
}

export function surveyOutreachSendingDisabledReason(): string {
  return "Survey email sending is disabled. Set SURVEY_OUTREACH_SEND_EMAILS=true when ready to go live.";
}

export function surveyApologySendingDisabledReason(): string {
  return "Apology email sending is disabled. Set SURVEY_APOLOGY_SEND_ENABLED=true to send.";
}
