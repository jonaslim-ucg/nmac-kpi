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

export type WaitTimeValue = (typeof WAIT_TIME_OPTIONS)[number]["value"];
export type PatientDurationValue = (typeof PATIENT_DURATION_OPTIONS)[number]["value"];

export type AppointmentReviewPayload = {
  appointmentEase: number;
  waitTime: WaitTimeValue;
  visitRating: number;
  providerTimeAdequate: boolean;
  providerTimeComment: string;
  understandDiagnosis: boolean;
  clinicalCareRating: number;
  clinicalCareComment: string;
  frontDeskRating: number;
  isPatient: boolean;
  patientDuration: PatientDurationValue;
  exceptionalStaffComment: string;
  improvementStaffComment: string;
  recommendLikelihood: number;
};

export type AppointmentReviewFormState = {
  appointmentEase: number | null;
  waitTime: WaitTimeValue | null;
  visitRating: number | null;
  providerTimeAdequate: boolean | null;
  providerTimeComment: string;
  understandDiagnosis: boolean | null;
  clinicalCareRating: number | null;
  clinicalCareComment: string;
  frontDeskRating: number | null;
  isPatient: boolean | null;
  patientDuration: PatientDurationValue | null;
  exceptionalStaffComment: string;
  improvementStaffComment: string;
  recommendLikelihood: number | null;
};

export const EMPTY_APPOINTMENT_REVIEW_FORM: AppointmentReviewFormState = {
  appointmentEase: null,
  waitTime: null,
  visitRating: null,
  providerTimeAdequate: null,
  providerTimeComment: "",
  understandDiagnosis: null,
  clinicalCareRating: null,
  clinicalCareComment: "",
  frontDeskRating: null,
  isPatient: null,
  patientDuration: null,
  exceptionalStaffComment: "",
  improvementStaffComment: "",
  recommendLikelihood: null,
};
