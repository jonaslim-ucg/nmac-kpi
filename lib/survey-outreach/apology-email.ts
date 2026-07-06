export const SURVEY_APOLOGY_SUBJECT =
  "Please disregard our recent survey email — sent in error";

export function patientFirstName(patientName: string | null | undefined): string {
  if (!patientName?.trim()) return "Patient";
  const parts = patientName.split(",").map((s) => s.trim());
  if (parts.length >= 2 && parts[1]) {
    return parts[1].split(/\s+/)[0] || parts[0];
  }
  return parts[0];
}

export function buildSurveyApologyEmailBody(patientName?: string | null): string {
  const first = patientFirstName(patientName);
  return `Dear ${first},

We are writing to let you know that the email you recently received from Northshore Medical & Aesthetics Center (NMAC) asking you to complete a visit survey was sent in error while our team was testing a new patient feedback system.

Please disregard that message. You do not need to complete the survey, and no further emails related to this test should be sent to you.

We sincerely apologize for any confusion or inconvenience this may have caused, especially if you received the message more than once.

Thank you for your understanding.

Kind regards,
Northshore Medical & Aesthetics Center`;
}

export type ApologySendResult = {
  sent: number;
  skipped: number;
  failed: { email: string; error: string }[];
};
