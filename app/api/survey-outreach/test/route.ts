import { NextResponse } from "next/server";
import { isValidEmailFormat } from "@/lib/auth/email-policy";
import { isAuthorizedSurveyOutreachRequest } from "@/lib/survey-outreach/auth";
import {
  isSurveyOutreachSendingEnabled,
  surveyOutreachSendingDisabledReason,
} from "@/lib/survey-outreach/config";
import { sendTestSurveyStage } from "@/lib/survey-outreach/send-stage";
import { SURVEY_OUTREACH_STAGES, type SurveyOutreachStage } from "@/lib/survey-outreach/types";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  if (!isAuthorizedSurveyOutreachRequest(req)) {
    return unauthorized();
  }

  if (!isSurveyOutreachSendingEnabled()) {
    return NextResponse.json(
      { ok: false, error: surveyOutreachSendingDisabledReason() },
      { status: 403 },
    );
  }

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
      force,
      reset,
      appointmentFinishedAt,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not send survey email." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: {
      method: "POST",
      auth: "Authorization: Bearer <SURVEY_OUTREACH_SECRET or AUTH_SECRET in dev>",
      body: {
        email: "patient@example.com",
        patientName: "Patient Name",
        stage: "initial | reminder1 | reminder2 | final",
        force: "optional — send immediately even if the initial delay has not passed, or resend if stage already sent",
        reset: "optional — delete prior test rows for this email first",
        appointmentFinishedAt: "optional ISO datetime when consultation ended (respects the 2-24h schedule unless force=true)",
      },
    },
    schedule: {
      initial: "2-24 hours after the patient's last appointment of the day",
      reminder1: "3 days after initial survey, only if incomplete",
      reminder2: "7 days after initial survey, only if incomplete",
      final: "14 or 21 days after initial survey, only if incomplete",
      sending: "Requires SURVEY_OUTREACH_SEND_EMAILS=true (off by default)",
    },
  });
}
