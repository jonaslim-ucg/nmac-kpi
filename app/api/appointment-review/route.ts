import { NextResponse } from "next/server";
import { isValidEmailFormat } from "@/lib/auth/email-policy";
import {
  APPOINTMENT_REVIEW_MAX_SCORE,
  RETURNING_PATIENT_DURATION_OPTIONS,
  REFERRAL_SOURCE_OPTIONS,
  TESTIMONIAL_PERMISSION_OPTIONS,
  WAIT_TIME_OPTIONS,
  isReferralSourceComplete,
  type AppointmentReviewPayload,
  type PatientDurationValue,
  type ReferralSourceValue,
  type TestimonialPermissionValue,
} from "@/lib/appointment-review/types";
import { insertAppointmentReview } from "@/lib/appointment-review/store";

export const dynamic = "force-dynamic";

const TESTIMONIAL_VALUES = new Set(TESTIMONIAL_PERMISSION_OPTIONS.map((o) => o.value));
const WAIT_VALUES = new Set(WAIT_TIME_OPTIONS.map((o) => o.value));
const RETURNING_DURATION_VALUES = new Set(RETURNING_PATIENT_DURATION_OPTIONS.map((o) => o.value));
const REFERRAL_VALUES = new Set(REFERRAL_SOURCE_OPTIONS.map((o) => o.value));

function scale(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > APPOINTMENT_REVIEW_MAX_SCORE) return null;
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

function parseReferralSources(v: unknown): ReferralSourceValue[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (item): item is ReferralSourceValue =>
      typeof item === "string" && REFERRAL_VALUES.has(item as ReferralSourceValue),
  );
}

function parsePayload(body: unknown): AppointmentReviewPayload | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Invalid request body." };
  }
  const b = body as Record<string, unknown>;

  const appointmentEase = scale(b.appointmentEase);
  const visitRating = scale(b.visitRating);
  const frontDeskRating = scale(b.frontDeskRating);
  const providerAndServices = str(b.providerAndServices);
  const email = str(b.email, 320).toLowerCase();
  const patientName = str(b.patientName, 200);
  const testimonialPermission =
    typeof b.testimonialPermission === "string" &&
    TESTIMONIAL_VALUES.has(b.testimonialPermission as TestimonialPermissionValue)
      ? (b.testimonialPermission as TestimonialPermissionValue)
      : null;
  const waitTime =
    typeof b.waitTime === "string" && WAIT_VALUES.has(b.waitTime as never) ? b.waitTime : null;
  const providerTimeAdequate = bool(b.providerTimeAdequate);
  const isNewPatient = bool(b.isNewPatient);

  if (
    !email ||
    !isValidEmailFormat(email) ||
    !patientName ||
    appointmentEase === null ||
    visitRating === null ||
    frontDeskRating === null ||
    !providerAndServices ||
    !testimonialPermission ||
    !waitTime ||
    providerTimeAdequate === null ||
    isNewPatient === null
  ) {
    return { error: "Please answer all required questions." };
  }

  let patientDuration: PatientDurationValue;
  let referralSources: ReferralSourceValue[] = [];
  let referralOther = "";

  if (isNewPatient) {
    patientDuration = "new";
    referralSources = parseReferralSources(b.referralSources);
    referralOther = str(b.referralOther, 500);
    if (!isReferralSourceComplete(true, referralSources, referralOther)) {
      return {
        error:
          referralSources.includes("other") && !referralOther
            ? "Please specify how you heard about NMAC."
            : "Please select at least one option for how you heard about NMAC.",
      };
    }
  } else {
    const returningDuration =
      typeof b.patientDuration === "string" &&
      RETURNING_DURATION_VALUES.has(b.patientDuration as never)
        ? b.patientDuration
        : null;
    if (!returningDuration) {
      return { error: "Please answer all required questions." };
    }
    patientDuration = returningDuration as PatientDurationValue;
  }

  return {
    email,
    patientName,
    appointmentEase,
    visitRating,
    providerAndServices,
    healthImprovement: str(b.healthImprovement),
    recommendationMessage: str(b.recommendationMessage),
    testimonialPermission,
    waitTime: waitTime as AppointmentReviewPayload["waitTime"],
    providerTimeAdequate,
    providerTimeComment: str(b.providerTimeComment),
    frontDeskRating,
    isNewPatient,
    patientDuration,
    referralSources,
    referralOther,
    exceptionalStaffComment: str(b.exceptionalStaffComment),
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
