import { NextResponse } from "next/server";
import { isAuthorizedThreeCxSecretRequest } from "@/lib/3cx/auth";
import { threeCxDailyPeriodFromEmailReceivedAt } from "@/lib/3cx/email-report";
import { logThreeCxImport, saveThreeCxImport } from "@/lib/3cx/import-server";
import { getGraphAccessToken } from "@/lib/graph/send-mail";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type GraphMessage = {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
};

type GraphFileAttachment = {
  "@odata.type"?: string;
  name?: string;
  contentType?: string;
  contentBytes?: string;
  isInline?: boolean;
};

type LocalDateTime = {
  year: number;
  monthIndex: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const POLL_START_HOUR = 9;
const POLL_END_HOUR_EXCLUSIVE = 12;
const DEFAULT_DAILY_REPORT_NEEDLES = ["DailyDataSending", "Daily Data Sending"];

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

function graphReportMailbox() {
  return process.env.GRAPH_3CX_REPORT_MAILBOX || process.env.GRAPH_REPORT_MAILBOX || process.env.GRAPH_SENDER_EMAIL || "";
}

function graphSubjectNeedle() {
  return (process.env.GRAPH_3CX_SUBJECT_QUERY || process.env.GRAPH_REPORT_SUBJECT_QUERY || "3CX").trim().toLowerCase();
}

function graphSenderNeedle() {
  return (process.env.GRAPH_3CX_SENDER || process.env.GRAPH_REPORT_SENDER || "").trim().toLowerCase();
}

function graphDailyReportNeedles() {
  const raw = process.env.GRAPH_3CX_DAILY_REPORT_QUERY ?? process.env.GRAPH_REPORT_DAILY_QUERY;
  const value = raw === undefined ? DEFAULT_DAILY_REPORT_NEEDLES.join(",") : raw;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function graphFolder() {
  return (process.env.GRAPH_3CX_FOLDER || process.env.GRAPH_REPORT_FOLDER || "inbox").trim() || "inbox";
}

function pollTimeZone() {
  return (process.env.GRAPH_3CX_POLL_TIME_ZONE || "Asia/Manila").trim() || "Asia/Manila";
}

function reportTimeZone() {
  return (process.env.GRAPH_3CX_REPORT_TIME_ZONE || "Atlantic/Bermuda").trim() || "Atlantic/Bermuda";
}

function actorEmail() {
  return process.env.GRAPH_3CX_IMPORT_ACTOR_EMAIL || graphReportMailbox() || "3cx-cron@nmac.local";
}

async function graphJson<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft Graph request failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

function graphDate(value: Date) {
  return value.toISOString();
}

function messageMatches(message: GraphMessage) {
  const subjectNeedle = graphSubjectNeedle();
  const senderNeedle = graphSenderNeedle();
  const subject = (message.subject ?? "").toLowerCase();
  const sender = (message.from?.emailAddress?.address ?? "").toLowerCase();
  if (subjectNeedle && !subject.includes(subjectNeedle)) return false;
  if (senderNeedle && !sender.includes(senderNeedle)) return false;
  return true;
}

function attachmentLooksReadable(attachment: GraphFileAttachment) {
  if (attachment.isInline) return false;
  const name = (attachment.name ?? "").toLowerCase();
  const type = (attachment.contentType ?? "").toLowerCase();
  return (
    name.endsWith(".csv") ||
    name.endsWith(".txt") ||
    name.endsWith(".tsv") ||
    type.includes("csv") ||
    type.startsWith("text/")
  );
}

function compactSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function textIncludesNeedle(value: string, needle: string) {
  const haystack = value.toLowerCase();
  const search = needle.toLowerCase();
  return haystack.includes(search) || compactSearchText(haystack).includes(compactSearchText(search));
}

function dailyReportMatches(message: GraphMessage, attachment: GraphFileAttachment, needles: string[]) {
  if (needles.length === 0) return true;
  const text = [message.subject, message.bodyPreview, attachment.name].filter(Boolean).join(" ");
  return needles.some((needle) => textIncludesNeedle(text, needle));
}

function decodeAttachment(attachment: GraphFileAttachment) {
  if (!attachment.contentBytes) return "";
  return Buffer.from(attachment.contentBytes, "base64").toString("utf8");
}

function numberPart(parts: Intl.DateTimeFormatPart[], type: string) {
  return Number(parts.find((part) => part.type === type)?.value);
}

function localDateTimeParts(value: Date, timeZone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(value);

  const year = numberPart(parts, "year");
  const month = numberPart(parts, "month");
  const day = numberPart(parts, "day");
  const hour = numberPart(parts, "hour");
  const minute = numberPart(parts, "minute");
  const second = numberPart(parts, "second");
  if ([year, month, day, hour, minute, second].some((part) => !Number.isFinite(part))) {
    throw new Error(`Could not read the current time in ${timeZone}.`);
  }
  return { year, monthIndex: month - 1, day, hour, minute, second };
}

function zonedDateTimeToUtc(value: Omit<LocalDateTime, "second"> & { second?: number }, timeZone: string) {
  const second = value.second ?? 0;
  const guess = new Date(Date.UTC(value.year, value.monthIndex, value.day, value.hour, value.minute, second));
  const actual = localDateTimeParts(guess, timeZone);
  const desiredUtcLike = Date.UTC(value.year, value.monthIndex, value.day, value.hour, value.minute, second);
  const actualUtcLike = Date.UTC(actual.year, actual.monthIndex, actual.day, actual.hour, actual.minute, actual.second);
  return new Date(guess.getTime() + desiredUtcLike - actualUtcLike);
}

function pollWindow(now: Date, timeZone: string) {
  const local = localDateTimeParts(now, timeZone);
  const start = zonedDateTimeToUtc({ ...local, hour: POLL_START_HOUR, minute: 0, second: 0 }, timeZone);
  const end = zonedDateTimeToUtc({ ...local, hour: POLL_END_HOUR_EXCLUSIVE, minute: 0, second: 0 }, timeZone);
  return {
    start,
    end,
    searchEnd: now < end ? now : end,
    localDate: `${local.year}-${String(local.monthIndex + 1).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`,
    localHour: local.hour,
    isOpen: now >= start && now < end,
  };
}

async function handleCron(req: Request) {
  if (!isAuthorizedThreeCxSecretRequest(req)) return unauthorized();

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
  const mailbox = graphReportMailbox();
  if (!mailbox) {
    return noStoreJson(
      { ok: false, error: "Set GRAPH_3CX_REPORT_MAILBOX or GRAPH_REPORT_MAILBOX for the inbox that receives 3CX reports." },
      { status: 500 },
    );
  }

  const actor = { email: actorEmail(), role: "system" };
  const now = new Date();
  const pollTz = pollTimeZone();
  const reportTz = reportTimeZone();
  const dailyReportNeedles = graphDailyReportNeedles();
  const window = pollWindow(now, pollTz);

  if (!force && !window.isOpen) {
    return noStoreJson({
      ok: true,
      checked: false,
      reason: `3CX daily email checks run from 9:00 AM to 11:59 AM in ${pollTz}.`,
      pollTimeZone: pollTz,
      reportTimeZone: reportTz,
      localDate: window.localDate,
      localHour: window.localHour,
    });
  }

  try {
    const token = await getGraphAccessToken();
    const folder = graphFolder();
    const params = new URLSearchParams({
      "$top": "50",
      "$select": "id,subject,receivedDateTime,from,bodyPreview,hasAttachments",
      "$orderby": "receivedDateTime desc",
      "$filter": `receivedDateTime ge ${graphDate(window.start)} and receivedDateTime lt ${graphDate(window.searchEnd)}`,
    });
    const messagesUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(
      folder,
    )}/messages?${params.toString()}`;

    const messagesJson = await graphJson<{ value?: GraphMessage[] }>(token, messagesUrl);
    const messages = (messagesJson.value ?? []).filter(messageMatches);
    const imported: unknown[] = [];
    const skipped: unknown[] = [];

    for (const message of messages) {
      const attachmentUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(
        message.id,
      )}/attachments`;
      const attachmentJson = await graphJson<{ value?: GraphFileAttachment[] }>(token, attachmentUrl);
      const readableAttachments = (attachmentJson.value ?? []).filter(attachmentLooksReadable);
      const attachments = readableAttachments.filter((attachment) => dailyReportMatches(message, attachment, dailyReportNeedles));

      if (readableAttachments.length > 0 && attachments.length === 0) {
        skipped.push({
          messageId: message.id,
          subject: message.subject,
          attachmentNames: readableAttachments.map((attachment) => attachment.name ?? ""),
          reason: "Readable attachments did not match the daily 3CX report filter.",
          dailyReportNeedles,
        });
      }

      for (const attachment of attachments) {
        const text = decodeAttachment(attachment);
        if (!text.trim()) {
          skipped.push({ messageId: message.id, attachmentName: attachment.name, reason: "Attachment had no readable text." });
          continue;
        }

        const period = threeCxDailyPeriodFromEmailReceivedAt(message.receivedDateTime, reportTz);
        if (!period) {
          skipped.push({ messageId: message.id, attachmentName: attachment.name, reason: "Missing received date." });
          continue;
        }

        try {
          const result = await saveThreeCxImport({
            actor,
            year: period.year,
            monthIndex: period.monthIndex,
            range: "day",
            day: period.day,
            text,
            source: {
              mode: "email",
              subject: message.subject ?? "",
              receivedDateTime: message.receivedDateTime ?? "",
              from: message.from?.emailAddress?.address ?? "",
              attachmentName: attachment.name ?? "",
              messageId: message.id,
              receivedLocalDate: window.localDate,
              reportDate: period.date,
              reportTimeZone: reportTz,
              pollTimeZone: pollTz,
            },
          });
          imported.push(result);
        } catch (error) {
          skipped.push({
            messageId: message.id,
            attachmentName: attachment.name,
            error: error instanceof Error ? error.message : "Could not import attachment.",
          });
        }
      }
    }

    if (imported.length === 0) {
      await logThreeCxImport(actor, "warn", "3CX daily email check found no readable report", {
        mailbox,
        folder,
        pollTimeZone: pollTz,
        reportTimeZone: reportTz,
        dailyReportNeedles,
        windowStart: window.start.toISOString(),
        windowEnd: window.searchEnd.toISOString(),
        messageCount: messages.length,
        skipped,
      });
    }

    return noStoreJson({
      ok: true,
      checked: true,
      imported,
      skipped,
      messageCount: messages.length,
      window: {
        pollTimeZone: pollTz,
        reportTimeZone: reportTz,
        dailyReportNeedles,
        start: window.start.toISOString(),
        end: window.searchEnd.toISOString(),
        localDate: window.localDate,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch the 3CX report email.";
    await logThreeCxImport(actor, "error", "3CX daily email check failed", {
      month: MONTHS[window.start.getUTCMonth()],
      mailbox,
      pollTimeZone: pollTz,
      reportTimeZone: reportTz,
      error: message,
    });
    return noStoreJson({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}
