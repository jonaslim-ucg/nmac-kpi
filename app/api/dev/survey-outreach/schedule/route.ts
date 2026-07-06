import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { isSurveyOutreachSendingEnabled } from "@/lib/survey-outreach/config";
import {
  getSurveyOutreachSchedule,
  updateSurveyOutreachSchedule,
} from "@/lib/survey-outreach/schedule-settings";
import {
  formatScheduleSummary,
  normalizeSurveyOutreachSchedule,
  validateSurveyOutreachScheduleInput,
} from "@/lib/survey-outreach/schedule";

export const dynamic = "force-dynamic";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return unauthorized();
  if (!canAccessDev(session.role)) return forbidden();

  const schedule = await getSurveyOutreachSchedule();
  return NextResponse.json({
    schedule,
    summary: formatScheduleSummary(schedule),
    sendingEnabled: isSurveyOutreachSendingEnabled(),
  });
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
  const current = await getSurveyOutreachSchedule();
  const requested = {
    initialDelayHours: b.initialDelayHours ?? current.initialDelayHours,
    reminder1Days: b.reminder1Days ?? current.reminder1Days,
    reminder2Days: b.reminder2Days ?? current.reminder2Days,
    finalReminderDays: b.finalReminderDays ?? current.finalReminderDays,
  };

  const validationError = validateSurveyOutreachScheduleInput(requested);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  const next = normalizeSurveyOutreachSchedule(requested);

  try {
    const schedule = await updateSurveyOutreachSchedule(next);
    return NextResponse.json({
      schedule,
      summary: formatScheduleSummary(schedule),
      sendingEnabled: isSurveyOutreachSendingEnabled(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save schedule." },
      { status: 500 },
    );
  }
}
