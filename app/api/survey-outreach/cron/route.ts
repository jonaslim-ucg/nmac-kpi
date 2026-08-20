import { NextResponse } from "next/server";
import {
  surveyOutreachAppDisabledReason,
  surveyOutreachLiveStartMissingReason,
  surveyOutreachSendingDisabledReason,
} from "@/lib/survey-outreach/config";
import { isAuthorizedSurveyOutreachRequest } from "@/lib/survey-outreach/auth";
import { runSurveyOutreachScheduler } from "@/lib/survey-outreach/run-scheduler";
import { runSurveyMonthlyReportScheduler } from "@/lib/survey-outreach/monthly-report-runner";
import { formatScheduleSummary } from "@/lib/survey-outreach/schedule";
import {
  getSurveyOutreachSchedule,
  recordSurveyOutreachSchedulerRun,
} from "@/lib/survey-outreach/schedule-settings";

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
    const monthlyReport = await runSurveyMonthlyReportScheduler().catch((error) => ({
      enabled: true,
      due: true,
      scheduledAt: new Date().toISOString(),
      periodKey: "unknown",
      periodLabel: "Unknown",
      sent: 0,
      skipped: 0,
      errors: 1,
      recipients: 0,
      error: error instanceof Error ? error.message : "Monthly survey report failed.",
    }));
    const schedule = await getSurveyOutreachSchedule();
    return NextResponse.json({
      ...result,
      monthlyReport,
      schedule: formatScheduleSummary(schedule),
      message:
        result.configurationErrors[0] ??
        (!result.sendingMasterEnabled
          ? surveyOutreachSendingDisabledReason()
          : !result.sendingAppEnabled
            ? surveyOutreachAppDisabledReason()
            : result.liveStartAt
              ? undefined
              : surveyOutreachLiveStartMissingReason()),
    });
  } catch (e) {
    console.error(e);
    const at = new Date().toISOString();
    await recordSurveyOutreachSchedulerRun({
      at,
      successful: false,
      error: e instanceof Error ? e.message : "Scheduler failed.",
      result: { sent: 0, skipped: 0, errors: 1, syncErrors: 0, deferredDue: 0 },
    }).catch(() => undefined);
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
