import {
  APPOINTMENT_REVIEW_MAX_SCORE,
  PATIENT_DURATION_OPTIONS,
  REFERRAL_SOURCE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  WAIT_TIME_OPTIONS,
  type PatientDurationValue,
  type ReferralSourceValue,
  type ServiceTypeValue,
  type TestimonialPermissionValue,
  type WaitTimeValue,
} from "@/lib/appointment-review/types";

export type AppointmentReviewRow = {
  id: string;
  created_at: string;
  email: string;
  patient_name: string;
  appointment_ease: number;
  visit_rating: number;
  provider_and_services: string;
  service_type: ServiceTypeValue | null;
  service_type_other: string;
  provider_rating: number | null;
  health_improvement: string;
  health_rating: number | null;
  confidence_rating: number | null;
  quality_of_life_rating: number | null;
  recommendation_message: string;
  recommendation_rating: number | null;
  would_encourage_patient: boolean | null;
  testimonial_permission: TestimonialPermissionValue;
  wait_time: WaitTimeValue;
  provider_time_adequate: boolean;
  provider_time_comment: string;
  front_desk_rating: number;
  is_new_patient: boolean;
  patient_duration: PatientDurationValue;
  referral_sources: ReferralSourceValue[];
  referral_other: string;
  exceptional_staff_comment: string;
};

export type LabelCount = { label: string; count: number; pct: number };

export type AppointmentReviewStats = {
  total: number;
  averages: {
    appointmentEase: number;
    visitRating: number;
    providerRating: number;
    healthRating: number;
    confidenceRating: number;
    qualityOfLifeRating: number;
    recommendationRating: number;
    frontDeskRating: number;
  };
  topVisitRatingPct: number;
  wouldEncouragePatient: LabelCount[];
  serviceTypes: LabelCount[];
  waitTime: LabelCount[];
  patientDuration: LabelCount[];
  providerTimeAdequate: LabelCount[];
  referralSources: LabelCount[];
  ratingTrend: { date: string; visit: number; ease: number; count: number }[];
  ratingScores: { metric: string; score: number }[];
  recentComments: {
    id: string;
    createdAt: string;
    kind: string;
    text: string;
  }[];
};

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function avgNullable(rows: AppointmentReviewRow[], pick: (row: AppointmentReviewRow) => number | null): number {
  const values = rows.map(pick).filter((v): v is number => v !== null);
  return Math.round(avg(values) * 10) / 10;
}

function labelCounts(
  rows: AppointmentReviewRow[],
  options: readonly { value: string; label: string }[],
  pick: (row: AppointmentReviewRow) => string | null,
): LabelCount[] {
  const total = rows.length;
  return options
    .map(({ value, label }) => {
      const count = rows.filter((r) => pick(r) === value).length;
      return { label, count, pct: total ? Math.round((count / total) * 100) : 0 };
    })
    .filter((item) => item.count > 0);
}

function yesNoCounts(rows: AppointmentReviewRow[], pick: (row: AppointmentReviewRow) => boolean): LabelCount[] {
  const total = rows.length;
  const yes = rows.filter((r) => pick(r)).length;
  const no = total - yes;
  return [
    { label: "Yes", count: yes, pct: total ? Math.round((yes / total) * 100) : 0 },
    { label: "No", count: no, pct: total ? Math.round((no / total) * 100) : 0 },
  ];
}

function groupByDay(rows: AppointmentReviewRow[]): AppointmentReviewStats["ratingTrend"] {
  const map = new Map<string, { visit: number[]; ease: number[] }>();
  for (const row of rows) {
    const date = row.created_at.slice(0, 10);
    const bucket = map.get(date) ?? { visit: [], ease: [] };
    bucket.visit.push(row.visit_rating);
    bucket.ease.push(row.appointment_ease);
    map.set(date, bucket);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      visit: Math.round(avg(vals.visit) * 10) / 10,
      ease: Math.round(avg(vals.ease) * 10) / 10,
      count: vals.visit.length,
    }));
}

export function buildAppointmentReviewStats(rows: AppointmentReviewRow[]): AppointmentReviewStats {
  const total = rows.length;
  const topVisit = rows.filter((r) => r.visit_rating >= APPOINTMENT_REVIEW_MAX_SCORE).length;

  const averages = {
    appointmentEase: Math.round(avg(rows.map((r) => r.appointment_ease)) * 10) / 10,
    visitRating: Math.round(avg(rows.map((r) => r.visit_rating)) * 10) / 10,
    providerRating: avgNullable(rows, (r) => r.provider_rating),
    healthRating: avgNullable(rows, (r) => r.health_rating),
    confidenceRating: avgNullable(rows, (r) => r.confidence_rating),
    qualityOfLifeRating: avgNullable(rows, (r) => r.quality_of_life_rating),
    recommendationRating: avgNullable(rows, (r) => r.recommendation_rating),
    frontDeskRating: Math.round(avg(rows.map((r) => r.front_desk_rating)) * 10) / 10,
  };

  const ratingScores = [
    { metric: "Scheduling ease", score: averages.appointmentEase },
    { metric: "Overall visit", score: averages.visitRating },
    { metric: "Provider", score: averages.providerRating },
    { metric: "Health improvement", score: averages.healthRating },
    { metric: "Confidence improvement", score: averages.confidenceRating },
    { metric: "Quality of life", score: averages.qualityOfLifeRating },
    { metric: "Likelihood to recommend", score: averages.recommendationRating },
    { metric: "Front desk", score: averages.frontDeskRating },
  ].filter((item) => item.score > 0);

  const commentKinds: { kind: string; pick: (r: AppointmentReviewRow) => string }[] = [
    { kind: "Care outcomes", pick: (r) => r.health_improvement },
    { kind: "Recommendation", pick: (r) => r.recommendation_message },
    { kind: "Provider visit", pick: (r) => r.provider_time_comment },
    { kind: "Exceptional staff", pick: (r) => r.exceptional_staff_comment },
  ];

  const recentComments = rows
    .flatMap((row) =>
      commentKinds
        .map(({ kind, pick }) => ({ id: row.id, createdAt: row.created_at, kind, text: pick(row).trim() }))
        .filter((c) => c.text.length > 0),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  const newPatients = rows.filter((r) => r.is_new_patient);

  const referralSources = REFERRAL_SOURCE_OPTIONS.map(({ value, label }) => {
    const count = newPatients.filter((r) => r.referral_sources.includes(value)).length;
    const referralTotal = newPatients.length;
    return { label, count, pct: referralTotal ? Math.round((count / referralTotal) * 100) : 0 };
  }).filter((item) => item.count > 0);

  const serviceTypes = labelCounts(rows, SERVICE_TYPE_OPTIONS, (r) => r.service_type);

  const wouldEncourageRows = rows.filter((r) => r.would_encourage_patient !== null);
  const wouldEncouragePatient = yesNoCounts(
    wouldEncourageRows,
    (r) => r.would_encourage_patient === true,
  );

  return {
    total,
    averages,
    topVisitRatingPct: total ? Math.round((topVisit / total) * 100) : 0,
    wouldEncouragePatient,
    serviceTypes,
    waitTime: labelCounts(rows, WAIT_TIME_OPTIONS, (r) => r.wait_time),
    patientDuration: labelCounts(rows, PATIENT_DURATION_OPTIONS, (r) => r.patient_duration),
    providerTimeAdequate: yesNoCounts(rows, (r) => r.provider_time_adequate),
    referralSources,
    ratingTrend: groupByDay(rows),
    ratingScores,
    recentComments,
  };
}
