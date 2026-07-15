import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { nextActionForRow, stageLabel } from "@/lib/survey-outreach/next-action";
import { getSurveyOutreachSchedule } from "@/lib/survey-outreach/schedule-settings";
import type { SurveyOutreachRow } from "@/lib/survey-outreach/types";

const DEFAULT_TEST_EMAIL = "kim.ramirez@ucg.bm";
const DEFAULT_TEST_NAME = "Kim Ramirez";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function safeEmail(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : DEFAULT_TEST_EMAIL;
}

function safeName(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TEST_NAME;
}

function safeDueInMinutes(value: unknown): number {
  const dueInMinutesRaw = Number(value ?? 0);
  return Number.isFinite(dueInMinutesRaw)
    ? Math.min(60 * 24, Math.max(0, Math.round(dueInMinutesRaw)))
    : 0;
}

function toPreparedState(row: SurveyOutreachRow | null, schedule: Awaited<ReturnType<typeof getSurveyOutreachSchedule>>) {
  const nextAction = row ? nextActionForRow(row, schedule) : null;
  return {
    row: row
      ? {
          id: row.id,
          patientEmail: row.patient_email,
          patientName: row.patient_name,
          initialSentAt: row.initial_sent_at,
          reminder1SentAt: row.reminder_1_sent_at,
          reminder2SentAt: row.reminder_2_sent_at,
          finalSentAt: row.final_sent_at,
          completedAt: row.completed_at,
          manualNextScheduledAt: row.manual_next_scheduled_at,
        }
      : null,
    nextAction: nextAction
      ? {
          stage: nextAction.stage,
          stageLabel: stageLabel(nextAction.stage),
          dueAt: nextAction.dueAt,
          isManual: nextAction.isManual,
        }
      : null,
  };
}

async function latestTestRow(email: string): Promise<SurveyOutreachRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("survey_outreach")
    .select("*")
    .eq("is_test", true)
    .ilike("patient_email", email)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? (data as SurveyOutreachRow) : null;
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) return unauthorized();
  if (!canAccessDev(session.role)) return forbidden();

  const email = safeEmail(new URL(req.url).searchParams.get("email"));

  try {
    const [row, schedule] = await Promise.all([
      latestTestRow(email),
      getSurveyOutreachSchedule(),
    ]);
    return NextResponse.json(toPreparedState(row, schedule));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load prepared test row." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
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
  const scenario = typeof b.scenario === "string" ? b.scenario : "";
  if (!["initial", "reminder1", "reminder2", "final"].includes(scenario)) {
    return NextResponse.json({ error: "Choose a valid survey stage scenario." }, { status: 400 });
  }

  const email = safeEmail(b.email);
  const patientName = safeName(b.patientName);
  const dueInMinutes = safeDueInMinutes(b.dueInMinutes);

  const now = new Date();
  const dueAt = new Date(now.getTime() + dueInMinutes * 60 * 1000);
  const appointmentAt = new Date(now.getTime() - 26 * 60 * 60 * 1000);
  const initialSentAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const reminder1SentAt = new Date(initialSentAt.getTime() + 3 * 24 * 60 * 60 * 1000);
  const reminder2SentAt = new Date(initialSentAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  const row = {
    crm_appointment_id: `dev-survey-${scenario}-${crypto.randomUUID()}`,
    patient_email: email,
    patient_name: patientName,
    appointment_date: appointmentAt.toISOString().slice(0, 10),
    appointment_at: appointmentAt.toISOString(),
    is_test: true,
    status: scenario === "initial" ? "pending" : "sent",
    initial_sent_at: scenario === "initial" ? null : initialSentAt.toISOString(),
    reminder_1_sent_at:
      scenario === "initial" || scenario === "reminder1" ? null : reminder1SentAt.toISOString(),
    reminder_2_sent_at: scenario === "final" ? reminder2SentAt.toISOString() : null,
    final_sent_at: null,
    manual_next_scheduled_at: dueAt.toISOString(),
    send_lock_token: null,
    send_lock_stage: null,
    send_lock_until: null,
    last_delivery_key: null,
    send_attempt_count: 0,
    last_send_attempt_at: null,
    next_retry_at: null,
    last_send_error: null,
    failed_stage: null,
    permanently_failed_at: null,
    completed_at: null,
    recalled_at: null,
    recall_reason: null,
  };

  try {
    const supabase = createServiceRoleClient();
    await supabase
      .from("survey_outreach")
      .delete()
      .eq("is_test", true)
      .ilike("patient_email", email);

    const { data, error } = await supabase
      .from("survey_outreach")
      .insert(row)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Could not prepare test survey row.");
    }

    const schedule = await getSurveyOutreachSchedule();
    return NextResponse.json({
      ...toPreparedState(data as SurveyOutreachRow, schedule),
      prepared: true,
      scenario,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not prepare test survey row." },
      { status: 500 },
    );
  }
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
  const email = safeEmail(b.email);
  const patientName = safeName(b.patientName);
  const dueInMinutes = safeDueInMinutes(b.dueInMinutes);
  const dueAt = new Date(Date.now() + dueInMinutes * 60 * 1000).toISOString();

  try {
    const current = await latestTestRow(email);
    if (!current) {
      return NextResponse.json(
        { error: "Prepare a test scenario before running the cron." },
        { status: 404 },
      );
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("survey_outreach")
      .update({
        patient_name: patientName,
        manual_next_scheduled_at: dueAt,
        send_lock_token: null,
        send_lock_stage: null,
        send_lock_until: null,
        last_delivery_key: null,
        send_attempt_count: 0,
        last_send_attempt_at: null,
        next_retry_at: null,
        last_send_error: null,
        failed_stage: null,
        permanently_failed_at: null,
        status: current.initial_sent_at ? "sent" : "pending",
      })
      .eq("id", current.id)
      .eq("is_test", true)
      .is("completed_at", null)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Could not update the current test row.");
    }

    const schedule = await getSurveyOutreachSchedule();
    return NextResponse.json({
      ...toPreparedState(data as SurveyOutreachRow, schedule),
      updated: true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update the current test row." },
      { status: 500 },
    );
  }
}
