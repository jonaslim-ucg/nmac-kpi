import type { AppointmentReviewRow } from "@/lib/appointment-review/analytics";
import { APPOINTMENT_REVIEW_MAX_SCORE, PATIENT_DURATION_OPTIONS, WAIT_TIME_OPTIONS } from "@/lib/appointment-review/types";

export type AppointmentReviewDetail = {
  id: string;
  createdAt: string;
  appointmentEase: number;
  waitTimeLabel: string;
  visitRating: number;
  providerTimeAdequate: boolean;
  providerTimeComment: string;
  understandDiagnosis: boolean;
  clinicalCareRating: number;
  clinicalCareComment: string;
  frontDeskRating: number;
  isPatient: boolean;
  patientDurationLabel: string;
  exceptionalStaffComment: string;
  improvementStaffComment: string;
  recommendLikelihood: number;
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
    row.provider_time_comment,
    row.clinical_care_comment,
    row.exceptional_staff_comment,
    row.improvement_staff_comment,
  ]
    .map((c) => c.trim())
    .filter(Boolean);
}

export function toAppointmentReviewDetail(row: AppointmentReviewRow): AppointmentReviewDetail {
  const comments = reviewComments(row);
  return {
    id: row.id,
    createdAt: row.created_at,
    appointmentEase: row.appointment_ease,
    waitTimeLabel: optionLabel(WAIT_TIME_OPTIONS, row.wait_time),
    visitRating: row.visit_rating,
    providerTimeAdequate: row.provider_time_adequate,
    providerTimeComment: row.provider_time_comment.trim(),
    understandDiagnosis: row.understand_diagnosis,
    clinicalCareRating: row.clinical_care_rating,
    clinicalCareComment: row.clinical_care_comment.trim(),
    frontDeskRating: row.front_desk_rating,
    isPatient: row.is_patient,
    patientDurationLabel: optionLabel(PATIENT_DURATION_OPTIONS, row.patient_duration),
    exceptionalStaffComment: row.exceptional_staff_comment.trim(),
    improvementStaffComment: row.improvement_staff_comment.trim(),
    recommendLikelihood: row.recommend_likelihood,
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

export function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export function formatRating(value: number): string {
  return `${value}/${APPOINTMENT_REVIEW_MAX_SCORE}`;
}
