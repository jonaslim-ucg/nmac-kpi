import { NextResponse } from "next/server";
import { isValidEmailFormat } from "@/lib/auth/email-policy";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import {
  normalizeSurveyMonthlyReportConfig,
  surveyMonthlyReportPeriod,
  validateSurveyMonthlyReportConfig,
} from "@/lib/survey-outreach/monthly-report-config";
import { sendSurveyMonthlyReportTest } from "@/lib/survey-outreach/monthly-report-runner";
import {
  getSurveyMonthlyReportConfig,
  getSurveyMonthlyReportHealth,
  listSurveyMonthlyReportDeliveries,
  updateSurveyMonthlyReportConfig,
} from "@/lib/survey-outreach/monthly-report-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function authorize() {
  const session = await getSessionFromCookies();
  if (!session) return { response: unauthorized(), session: null };
  if (!canAccessDev(session.role)) return { response: forbidden(), session: null };
  return { response: null, session };
}

export async function GET() {
  const auth = await authorize();
  if (auth.response) return auth.response;
  const [config, health, deliveries] = await Promise.all([
    getSurveyMonthlyReportConfig(),
    getSurveyMonthlyReportHealth(),
    listSurveyMonthlyReportDeliveries(),
  ]);
  return NextResponse.json({
    config,
    period: surveyMonthlyReportPeriod(config),
    health,
    deliveries,
  });
}

export async function PATCH(req: Request) {
  const auth = await authorize();
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const config = normalizeSurveyMonthlyReportConfig(body);
  const validationError = validateSurveyMonthlyReportConfig(config);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const saved = await updateSurveyMonthlyReportConfig(config);
    return NextResponse.json({
      config: saved,
      period: surveyMonthlyReportPeriod(saved),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save monthly report settings." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await authorize();
  if (auth.response || !auth.session) return auth.response ?? unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const value = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
  if (value.action !== "test") {
    return NextResponse.json({ error: "Unsupported monthly report action." }, { status: 400 });
  }
  const to = typeof value.to === "string" ? value.to.trim().toLowerCase() : "";
  const recipientName = typeof value.recipientName === "string" && value.recipientName.trim()
    ? value.recipientName.trim()
    : auth.session.email;
  if (!isValidEmailFormat(to)) {
    return NextResponse.json({ error: "Enter a valid test recipient email." }, { status: 400 });
  }

  try {
    const result = await sendSurveyMonthlyReportTest({ to, recipientName });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send monthly report test." },
      { status: 500 },
    );
  }
}
