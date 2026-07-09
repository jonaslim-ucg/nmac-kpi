import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { getSurveyOutreachSendingState } from "@/lib/survey-outreach/schedule-settings";
import { runSurveyOutreachScheduler } from "@/lib/survey-outreach/run-scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function forbidden(error = "Forbidden") {
  return NextResponse.json({ ok: false, error }, { status: 403 });
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST() {
  const session = await getSessionFromCookies();
  if (!session) return unauthorized();
  if (!canAccessDev(session.role)) return forbidden();

  if (process.env.NODE_ENV === "production") {
    return forbidden("Local scheduled checks are disabled in production.");
  }

  const sending = await getSurveyOutreachSendingState();
  if (sending.effectiveEnabled) {
    return NextResponse.json(
      {
        ok: false,
        error: "Local scheduled checks only run while production survey sending is off.",
      },
      { status: 409 },
    );
  }

  try {
    const result = await runSurveyOutreachScheduler(new Date(), { allowAnyTestRecipient: true });
    return NextResponse.json({
      ...result,
      localOnly: true,
      message:
        result.sent.length > 0
          ? `Sent ${result.sent.length} scheduled test email(s).`
          : "Checked schedule. No test email is due.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Scheduled check failed." },
      { status: 500 },
    );
  }
}
