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
  isTestimonialComplete,
  areServiceTypesComplete,
  type AppointmentReviewPayload,
  type PatientDurationValue,
  type ProviderRatings,
  type ReferralSourceValue,
  type ServiceTypeValue,
  type TestimonialPermissionValue,
} from "@/lib/appointment-review/types";
import { insertAppointmentReview } from "@/lib/appointment-review/store";
import {
  lookupOutreachByToken,
  markOutreachCompleted,
} from "@/lib/survey-outreach/store";

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

function parseServiceTypes(value: unknown, legacyValue: unknown): ServiceTypeValue[] | null {
  const raw = Array.isArray(value)
    ? value
    : typeof legacyValue === "string"
      ? [legacyValue]
      : [];
  if (
    raw.length === 0 ||
    raw.length > SERVICE_TYPE_OPTIONS.length ||
    raw.some((item) => typeof item !== "string" || !SERVICE_TYPE_VALUES.has(item as ServiceTypeValue))
  ) {
    return null;
  }
  return [...new Set(raw as ServiceTypeValue[])];
}

function parseProviderRatings(
  value: unknown,
  legacyValue: unknown,
  serviceTypes: ServiceTypeValue[],
): ProviderRatings | null {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const legacyRating = scale(legacyValue);
  const ratings: ProviderRatings = {};

  for (const serviceType of serviceTypes) {
    const score = source ? scale(source[serviceType]) : legacyRating;
    if (score === null) return null;
    ratings[serviceType] = score;
  }

  return ratings;
}

function parsePayload(body: unknown): AppointmentReviewPayload | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Invalid request body." };
  }
  const b = body as Record<string, unknown>;

  const appointmentEase = scale(b.appointmentEase);
  const visitRating = scale(b.visitRating);
  const healthRating = scale(b.healthRating);
  const confidenceRating = scale(b.confidenceRating);
  const qualityOfLifeRating = scale(b.qualityOfLifeRating);
  const recommendationRating = scale(b.recommendationRating);
  const frontDeskRating = scale(b.frontDeskRating);
  const email = str(b.email, 320).toLowerCase();
  const patientName = str(b.patientName, 200);
  const serviceTypes = parseServiceTypes(b.serviceTypes, b.serviceType);
  const providerRatings = serviceTypes
    ? parseProviderRatings(b.providerRatings, b.providerRating, serviceTypes)
    : null;
  const serviceTypeOther = str(b.serviceTypeOther, 500);
  const testimonialPermission =
    typeof b.testimonialPermission === "string" &&
    TESTIMONIAL_VALUES.has(b.testimonialPermission as TestimonialPermissionValue)
      ? (b.testimonialPermission as TestimonialPermissionValue)
      : null;
  const testimonialText = str(b.testimonialText, 2000);
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
    !providerRatings ||
    healthRating === null ||
    recommendationRating === null ||
    frontDeskRating === null ||
    !serviceTypes ||
    !areServiceTypesComplete(serviceTypes, serviceTypeOther) ||
    !testimonialPermission ||
    !waitTime ||
    !patientDuration ||
    providerTimeAdequate === null
  ) {
    return { error: "Please answer all required questions." };
  }

  if (!isTestimonialComplete(testimonialPermission, testimonialText)) {
    return { error: "Please write your testimonial before continuing." };
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
    serviceTypes,
    serviceTypeOther,
    providerRatings,
    healthRating,
    confidenceRating,
    qualityOfLifeRating,
    healthImprovementComment: "",
    recommendationRating,
    wouldEncouragePatient,
    recommendationMessage: "",
    testimonialPermission,
    testimonialText,
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

  if (parsed.surveyToken) {
    const outreach = await lookupOutreachByToken(parsed.surveyToken);
    if (!outreach) {
      return NextResponse.json(
        { ok: false, message: "This survey link is invalid or has expired." },
        { status: 400 },
      );
    }
    if (outreach.email.trim().toLowerCase() !== parsed.email) {
      return NextResponse.json(
        { ok: false, message: "This survey link does not match the supplied email address." },
        { status: 400 },
      );
    }
    if (outreach.completed) {
      return NextResponse.json(
        { ok: false, message: "This survey has already been submitted." },
        { status: 409 },
      );
    }
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
    return NextResponse.json(
      { ok: false, message: result.error },
      { status: result.duplicate ? 409 : 500 },
    );
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
