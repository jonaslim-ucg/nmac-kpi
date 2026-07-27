export function surveyBaseUrl(): string {
  const fromEnv =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "https://kpi.nmac.bm";
}

export function buildSurveyUrl(token: string): string {
  return `${surveyBaseUrl()}/appointment-review?t=${encodeURIComponent(token)}`;
}
