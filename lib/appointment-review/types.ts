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

export const SERVICE_TYPE_OPTIONS = [
  { value: "dr-ansuh-amponsah-natalie", label: "Dr. Natalie Ansuh-Amponsah" },
  { value: "dr-brown-kyjuan", label: "Dr. Kyjuan Brown" },
  { value: "dr-chandrruangphen-pornpat", label: "Dr. Pornpat Chandrruangphen" },
  { value: "dr-estwick-paula", label: "Dr. Paula Estwick" },
  { value: "dr-gonzalez-fermin", label: "Dr. Fermin Gonzalez" },
  { value: "dr-flood-amani", label: "Dr. Amani Flood" },
  { value: "dr-dzepina-davor", label: "Dr. Davor Dzepina" },
  { value: "other", label: "Other Providers" },
] as const;

export const RETURNING_PATIENT_DURATION_OPTIONS = PATIENT_DURATION_OPTIONS.filter(
  (option) => option.value !== "new",
);

export function isNewPatientDuration(duration: PatientDurationValue | null): boolean {
  return duration === "new";
}

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

export const REFERRAL_SOURCE_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "bernews", label: "Bernews" },
  { value: "tnn", label: "TNN" },
  { value: "tv-ad", label: "TV Advertisement" },
  { value: "friend-family", label: "Friend or Family" },
  { value: "provider-referral", label: "Healthcare Provider Referral" },
  { value: "nmac-staff", label: "NMAC staff" },
  { value: "other", label: "Other (please specify)" },
] as const;

export type ReferralSourceValue = (typeof REFERRAL_SOURCE_OPTIONS)[number]["value"];
export type ServiceTypeValue = (typeof SERVICE_TYPE_OPTIONS)[number]["value"];

export type WaitTimeValue = (typeof WAIT_TIME_OPTIONS)[number]["value"];
export type PatientDurationValue = (typeof PATIENT_DURATION_OPTIONS)[number]["value"];
export type TestimonialPermissionValue = (typeof TESTIMONIAL_PERMISSION_OPTIONS)[number]["value"];

export type AppointmentReviewPayload = {
  email: string;
  patientName: string;
  appointmentEase: number;
  visitRating: number;
  serviceType: ServiceTypeValue;
  serviceTypeOther: string;
  providerRating: number;
  healthRating: number;
  confidenceRating: number | null;
  qualityOfLifeRating: number | null;
  healthImprovementComment: string;
  recommendationRating: number;
  wouldEncouragePatient: boolean | null;
  recommendationMessage: string;
  testimonialPermission: TestimonialPermissionValue;
  waitTime: WaitTimeValue;
  providerTimeAdequate: boolean;
  providerTimeComment: string;
  frontDeskRating: number;
  patientDuration: PatientDurationValue;
  referralSources: ReferralSourceValue[];
  referralOther: string;
  exceptionalStaffComment: string;
  surveyToken: string | null;
};

export type AppointmentReviewFormState = {
  email: string;
  patientName: string;
  appointmentEase: number | null;
  visitRating: number | null;
  serviceType: ServiceTypeValue | null;
  serviceTypeOther: string;
  providerRating: number | null;
  healthRating: number | null;
  confidenceRating: number | null;
  qualityOfLifeRating: number | null;
  healthImprovementComment: string;
  recommendationRating: number | null;
  wouldEncouragePatient: boolean | null;
  recommendationMessage: string;
  testimonialPermission: TestimonialPermissionValue | null;
  waitTime: WaitTimeValue | null;
  providerTimeAdequate: boolean | null;
  providerTimeComment: string;
  frontDeskRating: number | null;
  patientDuration: PatientDurationValue | null;
  referralSources: ReferralSourceValue[];
  referralOther: string;
  exceptionalStaffComment: string;
  surveyToken: string | null;
};

export function isReferralSourceComplete(
  duration: PatientDurationValue,
  sources: ReferralSourceValue[],
  other: string,
): boolean {
  if (duration !== "new") return true;
  if (sources.length === 0) return false;
  if (sources.includes("other") && !other.trim()) return false;
  return true;
}

export function isServiceTypeComplete(
  serviceType: ServiceTypeValue | null,
  other: string,
): boolean {
  if (!serviceType) return false;
  if (serviceType === "other" && !other.trim()) return false;
  return true;
}

export function serviceTypeLabel(value: string, other: string): string {
  const base =
    SERVICE_TYPE_OPTIONS.find((o) => o.value === value)?.label ??
    (value === "alexander-dill" ? "Alexander Dill" : value);
  if (value === "other" && other.trim()) return `Other Providers: ${other.trim()}`;
  return base;
}

export const EMPTY_APPOINTMENT_REVIEW_FORM: AppointmentReviewFormState = {
  email: "",
  patientName: "",
  appointmentEase: null,
  visitRating: null,
  serviceType: null,
  serviceTypeOther: "",
  providerRating: null,
  healthRating: null,
  confidenceRating: null,
  qualityOfLifeRating: null,
  healthImprovementComment: "",
  recommendationRating: null,
  wouldEncouragePatient: null,
  recommendationMessage: "",
  testimonialPermission: null,
  waitTime: null,
  providerTimeAdequate: null,
  providerTimeComment: "",
  frontDeskRating: null,
  patientDuration: null,
  referralSources: [],
  referralOther: "",
  exceptionalStaffComment: "",
  surveyToken: null,
};
