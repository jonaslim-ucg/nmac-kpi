import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { getNextSurveyOutreachActions, stageLabel } from "@/lib/survey-outreach/next-action";
import { formatScheduleSummary } from "@/lib/survey-outreach/schedule";
import { getSurveyOutreachSchedule } from "@/lib/survey-outreach/schedule-settings";
import { isSurveyOutreachSendingEnabled } from "@/lib/survey-outreach/config";

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

  try {
    const [preview, schedule] = await Promise.all([
      getNextSurveyOutreachActions(),
      getSurveyOutreachSchedule(),
    ]);

    const next = preview.next;
    const nextDueMs = next ? new Date(next.dueAt).getTime() : null;
    const isPastDue = nextDueMs !== null && nextDueMs <= Date.now();

    return NextResponse.json({
      sendingEnabled: preview.sendingEnabled,
      productionSendingEnabled: isSurveyOutreachSendingEnabled(),
      testSendingAllowed: true,
      pendingCount: preview.pendingCount,
      scheduleSummary: formatScheduleSummary(schedule),
      nextAction: next
        ? {
            ...next,
            stageLabel: stageLabel(next.stage),
            isPastDue,
          }
        : null,
      upcoming: preview.upcoming.map((a) => ({
        ...a,
        stageLabel: stageLabel(a.stage),
      })),
      note: preview.sendingEnabled
        ? "Production sending is enabled. Automatic sends still require the deployment cron to be enabled."
        : "Production sending is off. Test emails can still be sent below. Enable SURVEY_OUTREACH_SEND_EMAILS for live patient emails.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load preview." },
      { status: 500 },
    );
  }
}
