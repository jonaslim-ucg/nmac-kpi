import { NextResponse } from "next/server";
import { surveyOutreachSendingDisabledReason } from "@/lib/survey-outreach/config";
import { isAuthorizedSurveyOutreachRequest } from "@/lib/survey-outreach/auth";
import { runSurveyOutreachScheduler } from "@/lib/survey-outreach/run-scheduler";
import { formatScheduleSummary } from "@/lib/survey-outreach/schedule";
import { getSurveyOutreachSchedule } from "@/lib/survey-outreach/schedule-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

async function handleCron(req: Request) {
  if (!isAuthorizedSurveyOutreachRequest(req)) {
    return unauthorized();
  }

  try {
    const result = await runSurveyOutreachScheduler();
    const schedule = await getSurveyOutreachSchedule();
    return NextResponse.json({
      ...result,
      schedule: formatScheduleSummary(schedule),
      message: result.sendingEnabled ? undefined : surveyOutreachSendingDisabledReason(),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Scheduler failed." },
      { status: 500 },
    );
  }
}

/** Vercel Cron invokes this path with GET every minute. */
export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}
