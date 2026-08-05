import type { SurveyOutreachStage } from "./types.ts";

export type GraphInternetMessageHeader = {
  name?: string | null;
  value?: string | null;
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const STATUS_PATTERN = /\b([45]\.\d{1,3}\.\d{1,3})\b/;

function compact(value: string, maxLength = 500): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function internetHeaderValue(
  headers: readonly GraphInternetMessageHeader[] | null | undefined,
  name: string,
): string | null {
  const match = headers?.find((header) => header.name?.trim().toLowerCase() === name.toLowerCase());
  const value = match?.value?.trim();
  return value || null;
}

export function originalInternetMessageId(
  headers: readonly GraphInternetMessageHeader[] | null | undefined,
): string | null {
  const raw = internetHeaderValue(headers, "in-reply-to")
    ?? internetHeaderValue(headers, "references");
  if (!raw) return null;
  const bracketed = raw.match(/<[^<>]+>/)?.[0];
  return (bracketed ?? raw.split(/\s+/)[0] ?? "").trim() || null;
}

export function originalSubjectFromNdr(subject: string | null | undefined): string {
  return (subject ?? "").replace(/^Undeliverable:\s*/i, "").trim();
}

export function surveyStageFromSubject(subject: string | null | undefined): SurveyOutreachStage | null {
  const normalized = (subject ?? "").trim().toLowerCase();
  if (
    normalized === "how was your recent visit to nmac?"
    || normalized === "how were your recent visits to nmac?"
  ) return "initial";
  if (normalized === "final reminder: nmac visit survey") return "final";
  if (normalized === "second reminder: nmac provider experience survey") return "reminder2";
  if (normalized === "reminder: share your nmac visit feedback") return "reminder1";
  if (normalized.includes("final reminder about your nmac visit")) return "final";
  if (normalized.includes("second reminder about your nmac visit")) return "reminder2";
  if (normalized.includes("reminder about your nmac visit")) return "reminder1";
  return null;
}

export function resolvedSurveyBounceStage(
  storedStage: SurveyOutreachStage | null | undefined,
  originalSubject: string | null | undefined,
): SurveyOutreachStage | null {
  return storedStage ?? surveyStageFromSubject(originalSubject);
}

export function bounceRecipient(
  body: string | null | undefined,
  bodyPreview: string | null | undefined,
): string | null {
  const text = [bodyPreview, body].filter(Boolean).join("\n");
  const direct = text.match(/your message to\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)?.[1];
  if (direct) return direct.toLowerCase();

  const failedGroup = text.match(
    /delivery has failed to (?:these|the following) recipients? or groups?:[\s\S]{0,500}?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  )?.[1];
  if (failedGroup) return failedGroup.toLowerCase();

  return text.match(EMAIL_PATTERN)?.[0]?.toLowerCase() ?? null;
}

export function bounceStatusCode(body: string | null | undefined): string | null {
  return body?.match(STATUS_PATTERN)?.[1] ?? null;
}

export function bounceReason(
  body: string | null | undefined,
  bodyPreview: string | null | undefined,
): string {
  const text = compact([bodyPreview, body].filter(Boolean).join("\n"), 4_000);
  if (/wasn(?:'|’)t found at|unknown to address|recipient (?:address )?(?:was )?not found|does not exist/i.test(text)) {
    return "Recipient address was not found.";
  }
  if (/mailbox (?:is )?full|quota exceeded|over quota/i.test(text)) {
    return "Recipient mailbox is full.";
  }
  if (/repeated attempts|delivery timed out|connection timed out/i.test(text)) {
    return "Delivery failed after repeated attempts.";
  }
  if (/blocked|access denied|rejected|not permitted/i.test(text)) {
    return "Recipient server rejected the message.";
  }
  if (/couldn(?:'|’)t be delivered|could not be delivered|delivery has failed/i.test(text)) {
    return "The email could not be delivered.";
  }
  return "Microsoft Outlook reported that the email was undeliverable.";
}

export function bounceDiagnostic(body: string | null | undefined): string {
  if (!body) return "";
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const diagnostic = lines.find((line) =>
    /diagnostic-code|remote server returned|\b[45]\.\d{1,3}\.\d{1,3}\b/i.test(line),
  );
  return compact(diagnostic ?? "");
}

export function isHardBounce(statusCode: string | null, body: string | null | undefined): boolean {
  if (statusCode?.startsWith("5.")) return true;
  return /wasn(?:'|’)t found at|unknown to address|recipient (?:address )?(?:was )?not found|does not exist/i.test(
    body ?? "",
  );
}
