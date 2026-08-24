import type { AppointmentReviewRow } from "@/lib/appointment-review/analytics";
import {
  normalizeAppointmentReviewActionStatus,
  type AppointmentReviewManagement,
} from "@/lib/appointment-review/management";
import {
  APPOINTMENT_REVIEW_MAX_SCORE,
  PATIENT_DURATION_OPTIONS,
  REFERRAL_SOURCE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  TESTIMONIAL_PERMISSION_OPTIONS,
  WAIT_TIME_OPTIONS,
  serviceTypeLabel,
  serviceTypesLabel,
  type ReferralSourceValue,
  type ServiceTypeValue,
  type TestimonialPermissionValue,
} from "@/lib/appointment-review/types";

export type AppointmentReviewDetail = {
  id: string;
  isTest: boolean;
  createdAt: string;
  appointmentDate: string | null;
  appointmentAt: string | null;
  appointmentProviderNames: string[];
  appointmentVisitTypes: string[];
  email: string;
  patientName: string;
  appointmentEase: number | null;
  visitRating: number | null;
  serviceTypeLabel: string;
  providerRating: number | null;
  providerRatings: { providerLabel: string; rating: number }[];
  healthRating: number | null;
  confidenceRating: number | null;
  qualityOfLifeRating: number | null;
  healthImprovementComment: string;
  recommendationRating: number | null;
  wouldEncouragePatient: boolean | null;
  recommendationMessage: string;
  testimonialPermission: TestimonialPermissionValue | null;
  testimonialPermissionLabel: string;
  testimonialText: string;
  waitTimeLabel: string;
  providerTimeAdequate: boolean | null;
  providerTimeComment: string;
  frontDeskRating: number | null;
  isNewPatient: boolean;
  patientDurationLabel: string;
  referralSources: ReferralSourceValue[];
  referralSourcesLabel: string | null;
  referralOther: string;
  exceptionalStaffComment: string;
  hasComments: boolean;
  commentPreview: string | null;
  feedbackManagement?: AppointmentReviewManagement;
};

export type AppointmentReviewWrittenResponse = {
  id: string;
  label: string;
  text: string;
};

type AppointmentReviewVisitMetadata = {
  isTest?: boolean;
  appointmentDate?: string | null;
  appointmentAt?: string | null;
  providerNames?: string[];
  visitTypes?: string[];
  includeFeedbackManagement?: boolean;
};

function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rating(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function resolveServiceTypeLabel(row: AppointmentReviewRow): string {
  if (Array.isArray(row.service_types) && row.service_types.length > 0) {
    return serviceTypesLabel(row.service_types, row.service_type_other);
  }
  const storedLabel = text(row.provider_and_services);
  if (storedLabel) return storedLabel;
  if (row.service_type) {
    return serviceTypeLabel(row.service_type, row.service_type_other);
  }
  return "—";
}

function resolveProviderRatings(
  row: AppointmentReviewRow,
): { providerLabel: string; rating: number }[] {
  const serviceTypes = Array.isArray(row.service_types) && row.service_types.length > 0
    ? row.service_types
    : row.service_type
      ? [row.service_type]
      : [];
  const storedRatings = row.provider_ratings && typeof row.provider_ratings === "object"
    ? row.provider_ratings
    : {};
  const ratings = serviceTypes.flatMap((serviceType) => {
    const score = rating(storedRatings[serviceType]);
    if (score === null) return [];
    return [{
      providerLabel: serviceTypeLabel(
        serviceType,
        serviceType === "other" ? row.service_type_other : "",
      ),
      rating: score,
    }];
  });
  if (ratings.length > 0) return ratings;

  const legacyRating = rating(row.provider_rating);
  return legacyRating === null
    ? []
    : [{ providerLabel: resolveServiceTypeLabel(row), rating: legacyRating }];
}

function reviewComments(row: AppointmentReviewRow): string[] {
  return [
    row.health_improvement,
    row.recommendation_message,
    row.testimonial_text,
    row.provider_time_comment,
    row.exceptional_staff_comment,
  ]
    .map(text)
    .filter(Boolean);
}

export function getAppointmentReviewWrittenResponses(
  review: AppointmentReviewDetail,
): AppointmentReviewWrittenResponse[] {
  return [
    { id: "health-improvement", label: "Health improvement", text: review.healthImprovementComment },
    { id: "recommendation", label: "Recommendation", text: review.recommendationMessage },
    { id: "testimonial", label: "Testimonial", text: review.testimonialText },
    { id: "provider-time", label: "Provider time", text: review.providerTimeComment },
    { id: "exceptional-staff", label: "Exceptional staff", text: review.exceptionalStaffComment },
  ].filter((answer) => answer.text.length > 0);
}

export function toAppointmentReviewDetail(
  row: AppointmentReviewRow,
  metadata: AppointmentReviewVisitMetadata = {},
): AppointmentReviewDetail {
  const comments = reviewComments(row);
  return {
    id: row.id,
    isTest: metadata.isTest ?? false,
    createdAt: row.created_at,
    appointmentDate: metadata.appointmentDate ?? null,
    appointmentAt: metadata.appointmentAt ?? null,
    appointmentProviderNames: metadata.providerNames ?? [],
    appointmentVisitTypes: metadata.visitTypes ?? [],
    email: text(row.email) || "—",
    patientName: text(row.patient_name) || "—",
    appointmentEase: rating(row.appointment_ease),
    visitRating: rating(row.visit_rating),
    serviceTypeLabel: resolveServiceTypeLabel(row),
    providerRating: rating(row.provider_rating),
    providerRatings: resolveProviderRatings(row),
    healthRating: rating(row.health_rating),
    confidenceRating: rating(row.confidence_rating),
    qualityOfLifeRating: rating(row.quality_of_life_rating),
    healthImprovementComment: text(row.health_improvement),
    recommendationRating: rating(row.recommendation_rating),
    wouldEncouragePatient: bool(row.would_encourage_patient),
    recommendationMessage: text(row.recommendation_message),
    testimonialPermission: row.testimonial_permission ?? null,
    testimonialPermissionLabel: formatTestimonialPermission(row.testimonial_permission),
    testimonialText: text(row.testimonial_text),
    waitTimeLabel: optionLabel(WAIT_TIME_OPTIONS, row.wait_time),
    providerTimeAdequate: bool(row.provider_time_adequate),
    providerTimeComment: text(row.provider_time_comment),
    frontDeskRating: rating(row.front_desk_rating),
    isNewPatient: row.is_new_patient,
    patientDurationLabel: optionLabel(PATIENT_DURATION_OPTIONS, row.patient_duration),
    referralSources: Array.isArray(row.referral_sources) ? row.referral_sources : [],
    referralSourcesLabel: formatReferralSources(row.referral_sources, row.referral_other),
    referralOther: text(row.referral_other),
    exceptionalStaffComment: text(row.exceptional_staff_comment),
    hasComments: comments.length > 0,
    commentPreview: comments[0] ?? null,
    ...(metadata.includeFeedbackManagement
      ? {
          feedbackManagement: {
            responsiblePerson: text(row.feedback_responsible_person),
            assignedToEmail: text(row.feedback_assigned_to_email).toLowerCase() || null,
            status: normalizeAppointmentReviewActionStatus(row.feedback_status),
            notes: text(row.feedback_notes),
            updatedAt: text(row.feedback_updated_at) || null,
            updatedBy: text(row.feedback_updated_by) || null,
          },
        }
      : {}),
  };
}

export function formatReviewWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatAppointmentDate(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${date.slice(0, 10)}T12:00:00`));
  } catch {
    return date;
  }
}

export function formatAppointmentTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, {
      timeZone: "Atlantic/Bermuda",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return "—";
  }
}

export function formatRating(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${value}/${APPOINTMENT_REVIEW_MAX_SCORE}`;
}

export function formatRatingOrDash(value: number | null | undefined): string {
  return formatRating(value);
}

export function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export function formatYesNoOrDash(value: boolean | null | undefined): string {
  return value == null ? "—" : formatYesNo(value);
}

export function formatTestimonialPermission(value: TestimonialPermissionValue | null | undefined): string {
  if (!value) return "—";
  return TESTIMONIAL_PERMISSION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function formatReferralSources(
  sources: ReferralSourceValue[] | null | undefined,
  other: string | null | undefined,
): string | null {
  const safeSources = Array.isArray(sources) ? sources : [];
  if (safeSources.length === 0) return null;
  const labels: string[] = safeSources
    .filter((value) => value !== "other")
    .map((value) => REFERRAL_SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value);
  if (safeSources.includes("other")) {
    const safeOther = text(other);
    labels.push(safeOther ? `Other: ${safeOther}` : "Other");
  }
  return labels.join(", ");
}

export function formatServiceType(value: ServiceTypeValue | null, other: string): string {
  if (!value) return "—";
  return serviceTypeLabel(value, other);
}

export { SERVICE_TYPE_OPTIONS };
