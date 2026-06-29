import type { AppointmentReviewRow } from "@/lib/appointment-review/analytics";
import { APPOINTMENT_REVIEW_MAX_SCORE } from "@/lib/appointment-review/types";

export type AppointmentReviewDetail = {
  id: string;
  createdAt: string;
  appointmentEase: number;
  visitRating: number;
  providerAndServices: string;
  healthImprovement: string;
  recommendationMessage: string;
  hasComments: boolean;
  commentPreview: string | null;
};

function reviewComments(row: AppointmentReviewRow): string[] {
  return [row.provider_and_services, row.health_improvement, row.recommendation_message]
    .map((c) => c.trim())
    .filter(Boolean);
}

export function toAppointmentReviewDetail(row: AppointmentReviewRow): AppointmentReviewDetail {
  const comments = reviewComments(row);
  return {
    id: row.id,
    createdAt: row.created_at,
    appointmentEase: row.appointment_ease,
    visitRating: row.visit_rating,
    providerAndServices: row.provider_and_services.trim(),
    healthImprovement: row.health_improvement.trim(),
    recommendationMessage: row.recommendation_message.trim(),
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
