import { timingSafeEqual } from "node:crypto";

export function bearerAuthorizationMatchesSecret(
  authorizationHeader: string | null,
  secret: string | null | undefined,
): boolean {
  const configuredSecret = secret?.trim();
  if (!configuredSecret) return false;

  const actual = authorizationHeader?.trim() ?? "";
  const expected = `Bearer ${configuredSecret}`;
  if (actual.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function authorizeAppointmentReviewReportRequest(req: Request): boolean {
  return bearerAuthorizationMatchesSecret(
    req.headers.get("authorization"),
    process.env.APPOINTMENT_REPORTS_API_KEY,
  );
}
