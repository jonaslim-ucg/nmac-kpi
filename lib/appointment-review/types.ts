export const APPOINTMENT_REVIEW_MAX_SCORE = 5;

export const WAIT_TIME_OPTIONS = [
  { value: "0-5", label: "0–5 minutes" },
  { value: "10-15", label: "10–15 minutes" },
  { value: "20-30", label: "20–30 minutes" },
  { value: "over-30", label: "Over 30 minutes" },
] as const;

export const PATIENT_DURATION_OPTIONS = [
  { value: "new", label: "New patient" },
  { value: "less-1", label: "Less than 1 year" },
  { value: "1-4", label: "1–4 years" },
  { value: "5-9", label: "5–9 years" },
  { value: "10-plus", label: "10 years or more" },
] as const;

export const TESTIMONIAL_PERMISSION_OPTIONS = [
  {
    value: "yes-named",
    label: "Yes, I give Northshore Medical & Aesthetics Center permission to use my comments.",
  },
  {
    value: "yes-anonymous",
    label: "Yes, but please do not use my name.",
  },
  {
    value: "confidential",
    label: "No, I prefer my feedback remain confidential.",
  },
] as const;

export type WaitTimeValue = (typeof WAIT_TIME_OPTIONS)[number]["value"];
export type PatientDurationValue = (typeof PATIENT_DURATION_OPTIONS)[number]["value"];
export type TestimonialPermissionValue = (typeof TESTIMONIAL_PERMISSION_OPTIONS)[number]["value"];

export type AppointmentReviewPayload = {
  email: string;
  patientName: string;
  appointmentEase: number;
  visitRating: number;
  providerAndServices: string;
  healthImprovement: string;
  recommendationMessage: string;
  testimonialPermission: TestimonialPermissionValue;
  waitTime: WaitTimeValue;
  providerTimeAdequate: boolean;
  providerTimeComment: string;
  frontDeskRating: number;
  patientDuration: PatientDurationValue;
  exceptionalStaffComment: string;
};

export type AppointmentReviewFormState = {
  email: string;
  patientName: string;
  appointmentEase: number | null;
  visitRating: number | null;
  providerAndServices: string;
  healthImprovement: string;
  recommendationMessage: string;
  testimonialPermission: TestimonialPermissionValue | null;
  waitTime: WaitTimeValue | null;
  providerTimeAdequate: boolean | null;
  providerTimeComment: string;
  frontDeskRating: number | null;
  patientDuration: PatientDurationValue | null;
  exceptionalStaffComment: string;
};

export const EMPTY_APPOINTMENT_REVIEW_FORM: AppointmentReviewFormState = {
  email: "",
  patientName: "",
  appointmentEase: null,
  visitRating: null,
  providerAndServices: "",
  healthImprovement: "",
  recommendationMessage: "",
  testimonialPermission: null,
  waitTime: null,
  providerTimeAdequate: null,
  providerTimeComment: "",
  frontDeskRating: null,
  patientDuration: null,
  exceptionalStaffComment: "",
};
