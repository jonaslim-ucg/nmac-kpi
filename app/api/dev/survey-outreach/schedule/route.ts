import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import {
  getSurveyOutreachSendingState,
  getSurveyOutreachSchedule,
  updateSurveyOutreachSendingEnabled,
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

  const [schedule, sending] = await Promise.all([
    getSurveyOutreachSchedule(),
    getSurveyOutreachSendingState(),
  ]);
  return NextResponse.json({
    schedule,
    summary: formatScheduleSummary(schedule),
    sendingEnabled: sending.effectiveEnabled,
    sendingAppEnabled: sending.appEnabled,
    sendingMasterEnabled: sending.masterEnabled,
    liveStartAt: sending.liveStartAt,
    sendingAppEnabledAt: sending.appEnabledAt,
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
  const requestedSendingEnabled =
    typeof b.sendingEnabled === "boolean" ? b.sendingEnabled : null;

  try {
    const [schedule, sending] = await Promise.all([
      updateSurveyOutreachSchedule(next),
      requestedSendingEnabled === null
        ? getSurveyOutreachSendingState()
        : updateSurveyOutreachSendingEnabled(requestedSendingEnabled),
    ]);
    return NextResponse.json({
      schedule,
      summary: formatScheduleSummary(schedule),
      sendingEnabled: sending.effectiveEnabled,
      sendingAppEnabled: sending.appEnabled,
      sendingMasterEnabled: sending.masterEnabled,
      liveStartAt: sending.liveStartAt,
      sendingAppEnabledAt: sending.appEnabledAt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save schedule." },
      { status: 500 },
    );
  }
}
