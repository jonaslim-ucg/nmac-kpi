import type { AppointmentReviewRow } from "@/lib/appointment-review/analytics";
import {
  APPOINTMENT_REVIEW_MAX_SCORE,
  PATIENT_DURATION_OPTIONS,
  TESTIMONIAL_PERMISSION_OPTIONS,
  WAIT_TIME_OPTIONS,
  type TestimonialPermissionValue,
} from "@/lib/appointment-review/types";

export type AppointmentReviewDetail = {
  id: string;
  createdAt: string;
  email: string;
  patientName: string;
  appointmentEase: number;
  visitRating: number;
  providerAndServices: string;
  healthImprovement: string;
  recommendationMessage: string;
  testimonialPermission: TestimonialPermissionValue;
  testimonialPermissionLabel: string;
  waitTimeLabel: string;
  providerTimeAdequate: boolean;
  providerTimeComment: string;
  frontDeskRating: number;
  patientDurationLabel: string;
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

function reviewComments(row: AppointmentReviewRow): string[] {
  return [
    row.provider_and_services,
    row.health_improvement,
    row.recommendation_message,
    row.provider_time_comment,
    row.exceptional_staff_comment,
  ]
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
    providerAndServices: row.provider_and_services.trim(),
    healthImprovement: row.health_improvement.trim(),
    recommendationMessage: row.recommendation_message.trim(),
    testimonialPermission: row.testimonial_permission,
    testimonialPermissionLabel: formatTestimonialPermission(row.testimonial_permission),
    waitTimeLabel: optionLabel(WAIT_TIME_OPTIONS, row.wait_time),
    providerTimeAdequate: row.provider_time_adequate,
    providerTimeComment: row.provider_time_comment.trim(),
    frontDeskRating: row.front_desk_rating,
    patientDurationLabel: optionLabel(PATIENT_DURATION_OPTIONS, row.patient_duration),
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

export function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export function formatTestimonialPermission(value: TestimonialPermissionValue): string {
  return TESTIMONIAL_PERMISSION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
