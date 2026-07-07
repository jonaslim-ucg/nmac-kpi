import { NextResponse } from "next/server";
import { isValidEmailFormat } from "@/lib/auth/email-policy";
import {
  APPOINTMENT_REVIEW_MAX_SCORE,
  PATIENT_DURATION_OPTIONS,
  REFERRAL_SOURCE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  TESTIMONIAL_PERMISSION_OPTIONS,
  WAIT_TIME_OPTIONS,
  isReferralSourceComplete,
  isServiceTypeComplete,
  type AppointmentReviewPayload,
  type PatientDurationValue,
  type ReferralSourceValue,
  type ServiceTypeValue,
  type TestimonialPermissionValue,
} from "@/lib/appointment-review/types";
import { insertAppointmentReview } from "@/lib/appointment-review/store";
import { markOutreachCompleted } from "@/lib/survey-outreach/store";

export const dynamic = "force-dynamic";

const TESTIMONIAL_VALUES = new Set(TESTIMONIAL_PERMISSION_OPTIONS.map((o) => o.value));
const WAIT_VALUES = new Set(WAIT_TIME_OPTIONS.map((o) => o.value));
const DURATION_VALUES = new Set(PATIENT_DURATION_OPTIONS.map((o) => o.value));
const REFERRAL_VALUES = new Set(REFERRAL_SOURCE_OPTIONS.map((o) => o.value));
const SERVICE_TYPE_VALUES = new Set(SERVICE_TYPE_OPTIONS.map((o) => o.value));

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
  const providerRating = scale(b.providerRating);
  const healthRating = scale(b.healthRating);
  const confidenceRating = scale(b.confidenceRating);
  const qualityOfLifeRating = scale(b.qualityOfLifeRating);
  const recommendationRating = scale(b.recommendationRating);
  const frontDeskRating = scale(b.frontDeskRating);
  const email = str(b.email, 320).toLowerCase();
  const patientName = str(b.patientName, 200);
  const serviceType =
    typeof b.serviceType === "string" && SERVICE_TYPE_VALUES.has(b.serviceType as ServiceTypeValue)
      ? (b.serviceType as ServiceTypeValue)
      : null;
  const serviceTypeOther = str(b.serviceTypeOther, 500);
  const testimonialPermission =
    typeof b.testimonialPermission === "string" &&
    TESTIMONIAL_VALUES.has(b.testimonialPermission as TestimonialPermissionValue)
      ? (b.testimonialPermission as TestimonialPermissionValue)
      : null;
  const waitTime =
    typeof b.waitTime === "string" && WAIT_VALUES.has(b.waitTime as never) ? b.waitTime : null;
  const patientDuration =
    typeof b.patientDuration === "string" && DURATION_VALUES.has(b.patientDuration as never)
      ? (b.patientDuration as PatientDurationValue)
      : null;
  const providerTimeAdequate = bool(b.providerTimeAdequate);
  const wouldEncouragePatient = bool(b.wouldEncouragePatient);

  if (
    !email ||
    !isValidEmailFormat(email) ||
    !patientName ||
    appointmentEase === null ||
    visitRating === null ||
    providerRating === null ||
    healthRating === null ||
    recommendationRating === null ||
    frontDeskRating === null ||
    !serviceType ||
    !isServiceTypeComplete(serviceType, serviceTypeOther) ||
    !testimonialPermission ||
    !waitTime ||
    !patientDuration ||
    providerTimeAdequate === null
  ) {
    return { error: "Please answer all required questions." };
  }

  const referralSources =
    patientDuration === "new" ? parseReferralSources(b.referralSources) : ([] as ReferralSourceValue[]);
  const referralOther = patientDuration === "new" ? str(b.referralOther, 500) : "";

  if (!isReferralSourceComplete(patientDuration, referralSources, referralOther)) {
    return {
      error:
        referralSources.includes("other") && !referralOther
          ? "Please specify how you heard about NMAC."
          : "Please select at least one option for how you heard about NMAC.",
    };
  }

  return {
    email,
    patientName,
    appointmentEase,
    visitRating,
    serviceType,
    serviceTypeOther,
    providerRating,
    healthRating,
    confidenceRating,
    qualityOfLifeRating,
    healthImprovementComment: "",
    recommendationRating,
    wouldEncouragePatient,
    recommendationMessage: "",
    testimonialPermission,
    waitTime: waitTime as AppointmentReviewPayload["waitTime"],
    providerTimeAdequate,
    providerTimeComment: "",
    frontDeskRating,
    patientDuration,
    referralSources,
    referralOther,
    exceptionalStaffComment: str(b.exceptionalStaffComment),
    surveyToken: typeof b.surveyToken === "string" && b.surveyToken.trim() ? b.surveyToken.trim() : null,
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

  if (parsed.surveyToken) {
    try {
      await markOutreachCompleted(parsed.surveyToken);
    } catch (e) {
      console.error("survey outreach complete:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
