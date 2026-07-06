import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { isValidEmailFormat } from "@/lib/auth/email-policy";
import { sendTestSurveyStage } from "@/lib/survey-outreach/send-stage";
import { SURVEY_OUTREACH_STAGES, type SurveyOutreachStage } from "@/lib/survey-outreach/types";

export const dynamic = "force-dynamic";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Dev-only test sends — works while SURVEY_OUTREACH_SEND_EMAILS=false. */
export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) return unauthorized();
  if (!canAccessDev(session.role)) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const patientName = typeof b.patientName === "string" ? b.patientName.trim() : "Test Patient";
  const stage = typeof b.stage === "string" ? b.stage : "initial";
  const force = b.force === true;
  const reset = b.reset === true;
  const appointmentFinishedAt =
    typeof b.appointmentFinishedAt === "string" ? b.appointmentFinishedAt.trim() : undefined;

  if (!email || !isValidEmailFormat(email)) {
    return NextResponse.json({ ok: false, error: "Valid email is required." }, { status: 400 });
  }

  if (!SURVEY_OUTREACH_STAGES.includes(stage as SurveyOutreachStage)) {
    return NextResponse.json(
      { ok: false, error: `stage must be one of: ${SURVEY_OUTREACH_STAGES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const result = await sendTestSurveyStage({
      email,
      patientName,
      stage: stage as SurveyOutreachStage,
      force: stage === "initial" ? (force || !appointmentFinishedAt) : force,
      reset,
      appointmentFinishedAt,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not send test survey email." },
      { status: 500 },
    );
  }
}
