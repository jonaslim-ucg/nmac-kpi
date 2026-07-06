import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { isSurveyApologySendingEnabled, surveyApologySendingDisabledReason } from "@/lib/survey-outreach/config";
import { getSurveyApologyStats, sendSurveyApologyEmails } from "@/lib/survey-outreach/send-apologies";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    const stats = await getSurveyApologyStats();
    return NextResponse.json(stats);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load apology stats." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) return unauthorized();
  if (!canAccessDev(session.role)) return forbidden();

  let dryRun = false;
  try {
    const body = (await req.json()) as { dryRun?: boolean };
    dryRun = body.dryRun === true;
  } catch {
    // empty body ok
  }

  if (!dryRun && !isSurveyApologySendingEnabled()) {
    return NextResponse.json({ error: surveyApologySendingDisabledReason() }, { status: 403 });
  }

  try {
    const result = await sendSurveyApologyEmails({ dryRun });
    const stats = await getSurveyApologyStats();
    return NextResponse.json({ ...result, ...stats });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Apology send failed." },
      { status: 500 },
    );
  }
}
