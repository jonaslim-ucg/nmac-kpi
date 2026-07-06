import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { nextActionForRow, stageLabel } from "@/lib/survey-outreach/next-action";
import { getSurveyOutreachSchedule } from "@/lib/survey-outreach/schedule-settings";
import {
  listSurveyOutreachForDev,
  outreachStagesLabel,
  updateManualNextScheduledAt,
} from "@/lib/survey-outreach/store";
import type { SurveyOutreachRow } from "@/lib/survey-outreach/types";

export const dynamic = "force-dynamic";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function toDevRow(row: SurveyOutreachRow, schedule: Awaited<ReturnType<typeof getSurveyOutreachSchedule>>) {
  const nextScheduledMessage = nextActionForRow(row, schedule);
  return {
    id: row.id,
    patientEmail: row.patient_email,
    patientName: row.patient_name,
    isTest: row.is_test,
    appointmentDate: row.appointment_date,
    appointmentAt: row.appointment_at,
    initialSentAt: row.initial_sent_at,
    reminder1SentAt: row.reminder_1_sent_at,
    reminder2SentAt: row.reminder_2_sent_at,
    finalSentAt: row.final_sent_at,
    manualNextScheduledAt: row.manual_next_scheduled_at,
    completedAt: row.completed_at,
    status: row.status,
    stagesSent: outreachStagesLabel(row),
    crmAppointmentId: row.crm_appointment_id,
    nextScheduledMessage: nextScheduledMessage
      ? {
          stage: nextScheduledMessage.stage,
          stageLabel: stageLabel(nextScheduledMessage.stage),
          dueAt: nextScheduledMessage.dueAt,
          isManual: nextScheduledMessage.isManual,
        }
      : null,
  };
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) return unauthorized();
  if (!canAccessDev(session.role)) return forbidden();

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const search = url.searchParams.get("search") ?? undefined;
  const testOnlyParam = url.searchParams.get("testOnly");
  const testOnly =
    testOnlyParam === "true" ? true : testOnlyParam === "false" ? false : undefined;
  const sentOnly = url.searchParams.get("sentOnly") !== "false";

  try {
    const [result, schedule] = await Promise.all([
      listSurveyOutreachForDev({ limit, offset, search, testOnly, sentOnly }),
      getSurveyOutreachSchedule(),
    ]);
    return NextResponse.json({
      rows: result.rows.map((row) => toDevRow(row, schedule)),
      total: result.total,
      stats: result.stats,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load survey outreach rows." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) return unauthorized();
  if (!canAccessDev(session.role)) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id.trim() : "";
  const rawManualNextScheduledAt = b.manualNextScheduledAt;

  if (!id) {
    return NextResponse.json({ error: "Outreach row id is required." }, { status: 400 });
  }

  let manualNextScheduledAt: string | null = null;
  if (rawManualNextScheduledAt !== null && rawManualNextScheduledAt !== undefined) {
    if (typeof rawManualNextScheduledAt !== "string") {
      return NextResponse.json({ error: "Next schedule must be a date/time string or null." }, { status: 400 });
    }
    const parsed = new Date(rawManualNextScheduledAt);
    if (!Number.isFinite(parsed.getTime())) {
      return NextResponse.json({ error: "Enter a valid next schedule date/time." }, { status: 400 });
    }
    manualNextScheduledAt = parsed.toISOString();
  }

  try {
    const [row, schedule] = await Promise.all([
      updateManualNextScheduledAt(id, manualNextScheduledAt),
      getSurveyOutreachSchedule(),
    ]);
    return NextResponse.json({ row: toDevRow(row, schedule) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update next scheduled survey time." },
      { status: 500 },
    );
  }
}
