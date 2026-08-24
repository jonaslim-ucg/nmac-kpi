import type { AppointmentReviewDetail } from "@/lib/appointment-review/display";
import type { AppointmentReviewActionStatus } from "@/lib/appointment-review/management";

export type AppointmentReviewFilters = {
  patientName: string;
  visitType: string;
  handler: string;
  provider: string;
  ratingMin: number;
  ratingMax: number;
  resolution: AppointmentReviewActionStatus | "";
};

export type AppointmentReviewFilterOptions = {
  patientNames: string[];
  visitTypes: string[];
  handlers: string[];
  providers: string[];
};

export const APPOINTMENT_REVIEW_RATING_MIN = 1;
export const APPOINTMENT_REVIEW_RATING_MAX = 5;

export const DEFAULT_APPOINTMENT_REVIEW_FILTERS: AppointmentReviewFilters = {
  patientName: "",
  visitType: "",
  handler: "",
  provider: "",
  ratingMin: APPOINTMENT_REVIEW_RATING_MIN,
  ratingMax: APPOINTMENT_REVIEW_RATING_MAX,
  resolution: "",
};

function uniqueSorted(values: string[]): string[] {
  const byNormalizedValue = new Map<string, string>();
  for (const value of values) {
    const cleaned = value.trim();
    if (!cleaned) continue;
    const key = cleaned.toLocaleLowerCase();
    if (!byNormalizedValue.has(key)) byNormalizedValue.set(key, cleaned);
  }
  return [...byNormalizedValue.values()].sort((first, second) => (
    first.localeCompare(second, undefined, { sensitivity: "base" })
  ));
}

export function getAppointmentReviewHandler(review: AppointmentReviewDetail): string {
  return review.feedbackManagement?.responsiblePerson.trim() || "Unassigned";
}

export function getAppointmentReviewProviderNames(review: AppointmentReviewDetail): string[] {
  if (review.appointmentProviderNames.length > 0) return review.appointmentProviderNames;
  if (review.providerRatings.length > 0) {
    return review.providerRatings.map((provider) => provider.providerLabel);
  }
  return review.serviceTypeLabel && review.serviceTypeLabel !== "—"
    ? [review.serviceTypeLabel]
    : [];
}

export function getAppointmentReviewAverageRating(
  review: AppointmentReviewDetail,
): number | null {
  const providerRating = review.providerRating ?? (
    review.providerRatings.length > 0
      ? review.providerRatings.reduce((sum, item) => sum + item.rating, 0)
        / review.providerRatings.length
      : null
  );
  const ratings = [
    review.appointmentEase,
    review.visitRating,
    providerRating,
    review.healthRating,
    review.recommendationRating,
    review.frontDeskRating,
  ].filter((value): value is number => value !== null);

  if (ratings.length === 0) return null;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

export function getAppointmentReviewFilterOptions(
  reviews: AppointmentReviewDetail[],
): AppointmentReviewFilterOptions {
  return {
    patientNames: uniqueSorted(reviews.map((review) => review.patientName)),
    visitTypes: uniqueSorted(reviews.flatMap((review) => review.appointmentVisitTypes)),
    handlers: uniqueSorted(reviews.map(getAppointmentReviewHandler)),
    providers: uniqueSorted(reviews.flatMap(getAppointmentReviewProviderNames)),
  };
}

export function countActiveAppointmentReviewFilters(
  filters: AppointmentReviewFilters,
): number {
  return [
    filters.patientName,
    filters.visitType,
    filters.handler,
    filters.provider,
    filters.resolution,
    filters.ratingMin > APPOINTMENT_REVIEW_RATING_MIN
      || filters.ratingMax < APPOINTMENT_REVIEW_RATING_MAX,
  ].filter(Boolean).length;
}

export function filterAppointmentReviews(
  reviews: AppointmentReviewDetail[],
  filters: AppointmentReviewFilters,
): AppointmentReviewDetail[] {
  const ratingRangeActive = filters.ratingMin > APPOINTMENT_REVIEW_RATING_MIN
    || filters.ratingMax < APPOINTMENT_REVIEW_RATING_MAX;

  return reviews.filter((review) => {
    if (filters.patientName && review.patientName !== filters.patientName) return false;
    if (filters.visitType && !review.appointmentVisitTypes.includes(filters.visitType)) return false;
    if (filters.handler && getAppointmentReviewHandler(review) !== filters.handler) return false;
    if (filters.provider && !getAppointmentReviewProviderNames(review).includes(filters.provider)) {
      return false;
    }
    if (
      filters.resolution
      && (review.feedbackManagement?.status ?? "needs_review") !== filters.resolution
    ) {
      return false;
    }
    if (ratingRangeActive) {
      const averageRating = getAppointmentReviewAverageRating(review);
      if (
        averageRating === null
        || averageRating < filters.ratingMin
        || averageRating > filters.ratingMax
      ) {
        return false;
      }
    }
    return true;
  });
}
