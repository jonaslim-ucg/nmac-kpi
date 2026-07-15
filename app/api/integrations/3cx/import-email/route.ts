import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { getGraphAccessToken } from "@/lib/graph/send-mail";
import {
  reportMonthWindow,
  threeCxPeriodFromEmailReceivedAt,
} from "@/lib/3cx/email-report";
import { logThreeCxImport, saveThreeCxImport } from "@/lib/3cx/import-server";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";

export const dynamic = "force-dynamic";

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

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

function parseYear(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : null;
}

function parseMonthIndex(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 11 ? n : null;
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

function graphFolder() {
  return (process.env.GRAPH_3CX_FOLDER || process.env.GRAPH_REPORT_FOLDER || "inbox").trim() || "inbox";
}

function graphReportTimeZone() {
  return (process.env.GRAPH_3CX_REPORT_TIME_ZONE || "Asia/Manila").trim() || "Asia/Manila";
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

function decodeAttachment(attachment: GraphFileAttachment) {
  if (!attachment.contentBytes) return "";
  return Buffer.from(attachment.contentBytes, "base64").toString("utf8");
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session || !canAccessDev(session.role)) return unauthorized();
  const actor = { email: session.email, role: session.role };

  const body = (await req.json()) as { year?: unknown; monthIndex?: unknown };
  const year = parseYear(body.year);
  const monthIndex = parseMonthIndex(body.monthIndex);
  if (year === null || monthIndex === null) {
    return NextResponse.json({ error: "Choose a valid month and year." }, { status: 400 });
  }

  const mailbox = graphReportMailbox();
  if (!mailbox) {
    return NextResponse.json(
      { error: "Set GRAPH_3CX_REPORT_MAILBOX or GRAPH_REPORT_MAILBOX for the inbox that receives 3CX reports." },
      { status: 500 },
    );
  }

  try {
    const { start, end } = reportMonthWindow(year, monthIndex);
    const token = await getGraphAccessToken();
    const folder = graphFolder();
    const reportTimeZone = graphReportTimeZone();
    const params = new URLSearchParams({
      "$top": "50",
      "$select": "id,subject,receivedDateTime,from,bodyPreview,hasAttachments",
      "$orderby": "receivedDateTime desc",
      "$filter": `receivedDateTime ge ${graphDate(start)} and receivedDateTime lt ${graphDate(end)}`,
    });
    const messagesUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(
      folder,
    )}/messages?${params.toString()}`;

    const messagesJson = await graphJson<{ value?: GraphMessage[] }>(token, messagesUrl);
    const messages = (messagesJson.value ?? []).filter(messageMatches);

    for (const message of messages) {
      const attachmentUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(
        message.id,
      )}/attachments`;
      const attachmentJson = await graphJson<{ value?: GraphFileAttachment[] }>(token, attachmentUrl);
      const attachments = (attachmentJson.value ?? []).filter(attachmentLooksReadable);

      for (const attachment of attachments) {
        const text = decodeAttachment(attachment);
        if (!text.trim()) continue;
        const period = threeCxPeriodFromEmailReceivedAt(message.receivedDateTime, reportTimeZone);
        if (!period) continue;
        try {
          const result = await saveThreeCxImport({
            actor,
            year: period.year,
            monthIndex: period.monthIndex,
            range: period.range,
            text,
            source: {
              mode: "email",
              subject: message.subject ?? "",
              receivedDateTime: message.receivedDateTime ?? "",
              from: message.from?.emailAddress?.address ?? "",
              attachmentName: attachment.name ?? "",
              messageId: message.id,
              receivedLocalDate: period.localDate,
            },
          });
          return NextResponse.json(result);
        } catch {
          continue;
        }
      }
    }

    const error = `No readable 3CX CSV report was found in ${MONTHS[monthIndex]} ${year}.`;
    await logThreeCxImport(actor, "warn", "3CX email import found no readable report", {
      year,
      monthIndex,
      month: MONTHS[monthIndex],
      mailbox,
      folder,
      messageCount: messages.length,
      reportTimeZone,
    });
    return NextResponse.json({ error }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch the 3CX report email.";
    await logThreeCxImport(actor, "error", "3CX email import failed", {
      year,
      monthIndex,
      month: MONTHS[monthIndex],
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
