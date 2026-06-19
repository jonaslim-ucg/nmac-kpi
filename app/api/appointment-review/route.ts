import { NextResponse } from "next/server";
import {
  PATIENT_DURATION_OPTIONS,
  WAIT_TIME_OPTIONS,
  type AppointmentReviewPayload,
} from "@/lib/appointment-review/types";
import { insertAppointmentReview } from "@/lib/appointment-review/store";

export const dynamic = "force-dynamic";

const WAIT_VALUES = new Set(WAIT_TIME_OPTIONS.map((o) => o.value));
const DURATION_VALUES = new Set(PATIENT_DURATION_OPTIONS.map((o) => o.value));

function scale(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > 10) return null;
  return v;
}

function bool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  return null;
}

function str(v: unknown, max = 4000): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function parsePayload(body: unknown): AppointmentReviewPayload | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Invalid request body." };
  }
  const b = body as Record<string, unknown>;

  const appointmentEase = scale(b.appointmentEase);
  const visitRating = scale(b.visitRating);
  const clinicalCareRating = scale(b.clinicalCareRating);
  const frontDeskRating = scale(b.frontDeskRating);
  const recommendLikelihood = scale(b.recommendLikelihood);

  const waitTime = typeof b.waitTime === "string" && WAIT_VALUES.has(b.waitTime as never) ? b.waitTime : null;
  const patientDuration =
    typeof b.patientDuration === "string" && DURATION_VALUES.has(b.patientDuration as never)
      ? b.patientDuration
      : null;

  const providerTimeAdequate = bool(b.providerTimeAdequate);
  const understandDiagnosis = bool(b.understandDiagnosis);
  const isPatient = bool(b.isPatient);

  if (
    appointmentEase === null ||
    visitRating === null ||
    clinicalCareRating === null ||
    frontDeskRating === null ||
    recommendLikelihood === null ||
    !waitTime ||
    !patientDuration ||
    providerTimeAdequate === null ||
    understandDiagnosis === null ||
    isPatient === null
  ) {
    return { error: "Please answer all required questions." };
  }

  return {
    appointmentEase,
    waitTime: waitTime as AppointmentReviewPayload["waitTime"],
    visitRating,
    providerTimeAdequate,
    providerTimeComment: str(b.providerTimeComment),
    understandDiagnosis,
    clinicalCareRating,
    clinicalCareComment: str(b.clinicalCareComment),
    frontDeskRating,
    isPatient,
    patientDuration: patientDuration as AppointmentReviewPayload["patientDuration"],
    exceptionalStaffComment: str(b.exceptionalStaffComment),
    improvementStaffComment: str(b.improvementStaffComment),
    recommendLikelihood,
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const parsed = parsePayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, message: parsed.error }, { status: 400 });
  }

  const result = await insertAppointmentReview(parsed);
  if (!result.ok) {
    if (result.setupRequired) {
      return NextResponse.json(
        {
          ok: false,
          setupRequired: true,
          message: "Review storage is not configured yet. Please contact the practice.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, message: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
