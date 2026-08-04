import { getGraphAccessToken } from "@/lib/graph/send-mail";
import {
  bounceDiagnostic,
  bounceReason,
  bounceRecipient,
  bounceStatusCode,
  internetHeaderValue,
  isHardBounce,
  originalInternetMessageId,
  originalSubjectFromNdr,
  surveyStageFromSubject,
  type GraphInternetMessageHeader,
} from "@/lib/survey-outreach/bounce-parser";
import {
  existingSurveyBounceMessageIds,
  getSurveyBounceScanState,
  recordSurveyBounce,
  recordSurveyBounceScan,
} from "@/lib/survey-outreach/bounce-store";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const GRAPH_TIMEOUT_MS = 15_000;
const INITIAL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const CHECKPOINT_OVERLAP_MS = 10 * 60 * 1000;
const MAX_LIST_PAGES = 20;
const PROCESSING_BATCH_SIZE = 5;
const DELIVERY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GraphMessage = {
  id: string;
  subject?: string | null;
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  bodyPreview?: string | null;
  body?: { content?: string | null } | null;
  internetMessageId?: string | null;
  internetMessageHeaders?: GraphInternetMessageHeader[] | null;
  toRecipients?: { emailAddress?: { address?: string | null } | null }[] | null;
};

type GraphCollection<T> = {
  value?: T[];
  "@odata.nextLink"?: string;
};

export type SurveyBounceTrackingResult = {
  scanned: number;
  recorded: number;
  matched: number;
  suppressed: number;
  duplicates: number;
  ignored: number;
  errors: string[];
};

function compactError(error: unknown): string {
  return (error instanceof Error ? error.message : "Bounce tracking failed.")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function graphHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"',
  };
}

async function graphJson<T>(token: string, url: string): Promise<T> {
  if (!url.startsWith(`${GRAPH_ROOT}/`)) throw new Error("Microsoft Graph returned an invalid page URL.");
  const response = await fetch(url, {
    headers: graphHeaders(token),
    signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 500);
    throw new Error(`Microsoft Graph mailbox read failed: ${response.status} ${detail}`);
  }
  return (await response.json()) as T;
}

function graphUrl(path: string, params: URLSearchParams): string {
  return `${GRAPH_ROOT}${path}?${params.toString()}`;
}

function odataString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function listNdrMessages(token: string, sender: string, from: Date): Promise<GraphMessage[]> {
  const params = new URLSearchParams({
    "$top": "100",
    "$select": "id,subject,receivedDateTime",
    "$orderby": "receivedDateTime asc",
    "$filter": `receivedDateTime ge ${from.toISOString()} and startswith(subject,'Undeliverable:')`,
  });
  let nextUrl: string | null = graphUrl(
    `/users/${encodeURIComponent(sender)}/mailFolders/inbox/messages`,
    params,
  );
  const messages: GraphMessage[] = [];

  for (let page = 0; nextUrl && page < MAX_LIST_PAGES; page++) {
    const result: GraphCollection<GraphMessage> = await graphJson<GraphCollection<GraphMessage>>(token, nextUrl);
    messages.push(...(result.value ?? []));
    nextUrl = result["@odata.nextLink"] ?? null;
  }
  if (nextUrl) throw new Error("Too many unprocessed Outlook non-delivery reports; the scan will retry.");
  return messages;
}

async function getNdrMessage(token: string, sender: string, id: string): Promise<GraphMessage> {
  const params = new URLSearchParams({
    "$select": "id,subject,receivedDateTime,bodyPreview,body,internetMessageHeaders",
  });
  return graphJson<GraphMessage>(
    token,
    graphUrl(`/users/${encodeURIComponent(sender)}/messages/${encodeURIComponent(id)}`, params),
  );
}

async function findOriginalSentMessage(
  token: string,
  sender: string,
  internetMessageId: string | null,
): Promise<GraphMessage | null> {
  if (!internetMessageId) return null;
  const params = new URLSearchParams({
    "$top": "5",
    "$select": "id,subject,sentDateTime,toRecipients,internetMessageId,internetMessageHeaders",
    "$filter": `internetMessageId eq ${odataString(internetMessageId)}`,
  });
  const result = await graphJson<GraphCollection<GraphMessage>>(
    token,
    graphUrl(`/users/${encodeURIComponent(sender)}/messages`, params),
  );
  return result.value?.find((message) =>
    Boolean(internetHeaderValue(message.internetMessageHeaders, "x-nmac-survey-delivery-key")),
  ) ?? result.value?.[0] ?? null;
}

function sentRecipient(message: GraphMessage | null): string | null {
  const address = message?.toRecipients?.[0]?.emailAddress?.address?.trim().toLowerCase();
  return address || null;
}

function deliveryKey(message: GraphMessage | null): string | null {
  const value = internetHeaderValue(message?.internetMessageHeaders, "x-nmac-survey-delivery-key");
  return value && DELIVERY_KEY_PATTERN.test(value) ? value : null;
}

async function processNdr(token: string, sender: string, summary: GraphMessage) {
  const ndr = await getNdrMessage(token, sender, summary.id);
  const originalMessageId = originalInternetMessageId(ndr.internetMessageHeaders);
  const originalSent = await findOriginalSentMessage(token, sender, originalMessageId);
  const originalSubject = originalSent?.subject?.trim() || originalSubjectFromNdr(ndr.subject);
  const stage = surveyStageFromSubject(originalSubject);
  const key = deliveryKey(originalSent);
  if (!stage && !key) return null;
  const body = ndr.body?.content ?? "";
  const recipient = sentRecipient(originalSent) ?? bounceRecipient(body, ndr.bodyPreview);
  const statusCode = bounceStatusCode(body);
  const receivedAt = ndr.receivedDateTime ?? summary.receivedDateTime;
  if (!receivedAt || !Number.isFinite(new Date(receivedAt).getTime())) {
    throw new Error(`NDR ${summary.id} does not contain a valid received time.`);
  }

  return recordSurveyBounce({
    graphMessageId: ndr.id,
    graphSentMessageId: originalSent?.id ?? null,
    originalInternetMessageId: originalMessageId,
    deliveryKey: key,
    recipientEmail: recipient,
    originalSubject,
    stage,
    receivedAt,
    originalSentAt: originalSent?.sentDateTime ?? null,
    statusCode,
    reason: bounceReason(body, ndr.bodyPreview),
    diagnostic: bounceDiagnostic(body),
    hardBounce: isHardBounce(statusCode, body),
  });
}

export async function trackSurveyEmailBounces(now = new Date()): Promise<SurveyBounceTrackingResult> {
  const sender = process.env.GRAPH_SENDER_EMAIL?.trim();
  if (!sender) throw new Error("GRAPH_SENDER_EMAIL is not configured for bounce tracking.");
  const state = await getSurveyBounceScanState();
  const previous = state.lastCheckedAt ? new Date(state.lastCheckedAt) : null;
  const from = previous && Number.isFinite(previous.getTime())
    ? new Date(previous.getTime() - CHECKPOINT_OVERLAP_MS)
    : new Date(now.getTime() - INITIAL_LOOKBACK_MS);
  const result: SurveyBounceTrackingResult = {
    scanned: 0,
    recorded: 0,
    matched: 0,
    suppressed: 0,
    duplicates: 0,
    ignored: 0,
    errors: [],
  };

  try {
    const token = await getGraphAccessToken();
    const summaries = await listNdrMessages(token, sender, from);
    result.scanned = summaries.length;
    const existing = await existingSurveyBounceMessageIds(summaries.map((message) => message.id));

    for (let offset = 0; offset < summaries.length; offset += PROCESSING_BATCH_SIZE) {
      const outcomes = await Promise.all(
        summaries.slice(offset, offset + PROCESSING_BATCH_SIZE).map(async (summary) => {
          if (existing.has(summary.id)) return { kind: "duplicate" as const };
          try {
            const recorded = await processNdr(token, sender, summary);
            return recorded ? { kind: "recorded" as const, recorded } : { kind: "ignored" as const };
          } catch (error) {
            return { kind: "error" as const, error: compactError(error) };
          }
        }),
      );

      for (const outcome of outcomes) {
        if (outcome.kind === "duplicate") result.duplicates++;
        if (outcome.kind === "ignored") result.ignored++;
        if (outcome.kind === "error") result.errors.push(outcome.error);
        if (outcome.kind === "recorded") {
          if (!outcome.recorded.created) {
            result.duplicates++;
            continue;
          }
          result.recorded++;
          if (outcome.recorded.matched) result.matched++;
          if (outcome.recorded.suppressed) result.suppressed++;
        }
      }
    }

    const successful = result.errors.length === 0;
    await recordSurveyBounceScan({
      checkedAt: successful ? now.toISOString() : state.lastCheckedAt ?? from.toISOString(),
      successful,
      error: result.errors[0] ?? null,
      result,
    });
    return result;
  } catch (error) {
    const message = compactError(error);
    result.errors.push(message);
    await recordSurveyBounceScan({
      checkedAt: state.lastCheckedAt ?? from.toISOString(),
      successful: false,
      error: message,
      result,
    }).catch(() => undefined);
    throw error;
  }
}
