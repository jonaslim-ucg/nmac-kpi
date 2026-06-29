export const APPOINTMENT_REVIEW_MAX_SCORE = 5;

export type AppointmentReviewPayload = {
  appointmentEase: number;
  visitRating: number;
  providerAndServices: string;
  healthImprovement: string;
  recommendationMessage: string;
};

export type AppointmentReviewFormState = {
  appointmentEase: number | null;
  visitRating: number | null;
  providerAndServices: string;
  healthImprovement: string;
  recommendationMessage: string;
};

export const EMPTY_APPOINTMENT_REVIEW_FORM: AppointmentReviewFormState = {
  appointmentEase: null,
  visitRating: null,
  providerAndServices: "",
  healthImprovement: "",
  recommendationMessage: "",
};
