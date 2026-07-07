import type { AppointmentReviewRow } from "@/lib/appointment-review/analytics";
import {
  APPOINTMENT_REVIEW_MAX_SCORE,
  PATIENT_DURATION_OPTIONS,
  REFERRAL_SOURCE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  TESTIMONIAL_PERMISSION_OPTIONS,
  WAIT_TIME_OPTIONS,
  serviceTypeLabel,
  type ReferralSourceValue,
  type ServiceTypeValue,
  type TestimonialPermissionValue,
} from "@/lib/appointment-review/types";

export type AppointmentReviewDetail = {
  id: string;
  createdAt: string;
  email: string;
  patientName: string;
  appointmentEase: number;
  visitRating: number;
  serviceTypeLabel: string;
  providerRating: number | null;
  healthRating: number | null;
  confidenceRating: number | null;
  qualityOfLifeRating: number | null;
  healthImprovementComment: string;
  recommendationRating: number | null;
  wouldEncouragePatient: boolean | null;
  recommendationMessage: string;
  testimonialPermission: TestimonialPermissionValue;
  testimonialPermissionLabel: string;
  waitTimeLabel: string;
  providerTimeAdequate: boolean;
  providerTimeComment: string;
  frontDeskRating: number;
  isNewPatient: boolean;
  patientDurationLabel: string;
  referralSources: ReferralSourceValue[];
  referralSourcesLabel: string | null;
  referralOther: string;
  exceptionalStaffComment: string;
  hasComments: boolean;
  commentPreview: string | null;
};

function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function resolveServiceTypeLabel(row: AppointmentReviewRow): string {
  if (row.service_type) {
    return serviceTypeLabel(row.service_type, row.service_type_other);
  }
  return row.provider_and_services.trim();
}

function reviewComments(row: AppointmentReviewRow): string[] {
  return [row.provider_time_comment, row.exceptional_staff_comment]
    .map((c) => c.trim())
    .filter(Boolean);
}

export function toAppointmentReviewDetail(row: AppointmentReviewRow): AppointmentReviewDetail {
  const comments = reviewComments(row);
  return {
    id: row.id,
    createdAt: row.created_at,
    email: row.email.trim(),
    patientName: row.patient_name.trim(),
    appointmentEase: row.appointment_ease,
    visitRating: row.visit_rating,
    serviceTypeLabel: resolveServiceTypeLabel(row),
    providerRating: row.provider_rating,
    healthRating: row.health_rating,
    confidenceRating: row.confidence_rating,
    qualityOfLifeRating: row.quality_of_life_rating,
    healthImprovementComment: row.health_improvement.trim(),
    recommendationRating: row.recommendation_rating,
    wouldEncouragePatient: row.would_encourage_patient,
    recommendationMessage: row.recommendation_message.trim(),
    testimonialPermission: row.testimonial_permission,
    testimonialPermissionLabel: formatTestimonialPermission(row.testimonial_permission),
    waitTimeLabel: optionLabel(WAIT_TIME_OPTIONS, row.wait_time),
    providerTimeAdequate: row.provider_time_adequate,
    providerTimeComment: row.provider_time_comment.trim(),
    frontDeskRating: row.front_desk_rating,
    isNewPatient: row.is_new_patient,
    patientDurationLabel: optionLabel(PATIENT_DURATION_OPTIONS, row.patient_duration),
    referralSources: row.referral_sources,
    referralSourcesLabel: formatReferralSources(row.referral_sources, row.referral_other),
    referralOther: row.referral_other.trim(),
    exceptionalStaffComment: row.exceptional_staff_comment.trim(),
    hasComments: comments.length > 0,
    commentPreview: comments[0] ?? null,
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

export function formatRating(value: number): string {
  return `${value}/${APPOINTMENT_REVIEW_MAX_SCORE}`;
}

export function formatRatingOrDash(value: number | null): string {
  return value === null ? "—" : formatRating(value);
}

export function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export function formatYesNoOrDash(value: boolean | null): string {
  return value === null ? "—" : formatYesNo(value);
}

export function formatTestimonialPermission(value: TestimonialPermissionValue): string {
  return TESTIMONIAL_PERMISSION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function formatReferralSources(
  sources: ReferralSourceValue[],
  other: string,
): string | null {
  if (sources.length === 0) return null;
  const labels: string[] = sources
    .filter((value) => value !== "other")
    .map((value) => REFERRAL_SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value);
  if (sources.includes("other")) {
    labels.push(other.trim() ? `Other: ${other.trim()}` : "Other");
  }
  return labels.join(", ");
}

export function formatServiceType(value: ServiceTypeValue | null, other: string): string {
  if (!value) return "—";
  return serviceTypeLabel(value, other);
}

export { SERVICE_TYPE_OPTIONS };
