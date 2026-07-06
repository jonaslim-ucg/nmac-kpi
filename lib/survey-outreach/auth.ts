export function surveyOutreachSecret(): string | null {
  const explicit = process.env.SURVEY_OUTREACH_SECRET?.trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV !== "production") {
    return process.env.AUTH_SECRET?.trim() || null;
  }
  return null;
}

export function isAuthorizedSurveyOutreachRequest(req: Request): boolean {
  const header = req.headers.get("authorization")?.trim();
  if (!header?.toLowerCase().startsWith("bearer ")) return false;
  const token = header.slice(7).trim();

  const allowed = [
    process.env.SURVEY_OUTREACH_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
    process.env.NODE_ENV !== "production" ? process.env.AUTH_SECRET?.trim() : null,
  ].filter((s): s is string => Boolean(s));

  return allowed.some((secret) => secret === token);
}
