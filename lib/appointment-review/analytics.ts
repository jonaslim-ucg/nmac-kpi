import {
  APPOINTMENT_REVIEW_MAX_SCORE,
  PATIENT_DURATION_OPTIONS,
  WAIT_TIME_OPTIONS,
  type PatientDurationValue,
  type WaitTimeValue,
} from "@/lib/appointment-review/types";

export type AppointmentReviewRow = {
  id: string;
  created_at: string;
  appointment_ease: number;
  wait_time: WaitTimeValue;
  visit_rating: number;
  provider_time_adequate: boolean;
  provider_time_comment: string;
  understand_diagnosis: boolean;
  clinical_care_rating: number;
  clinical_care_comment: string;
  front_desk_rating: number;
  is_patient: boolean;
  patient_duration: PatientDurationValue;
  exceptional_staff_comment: string;
  improvement_staff_comment: string;
  recommend_likelihood: number;
};

export type LabelCount = { label: string; count: number; pct: number };

export type AppointmentReviewStats = {
  total: number;
  averages: {
    appointmentEase: number;
    visitRating: number;
    clinicalCareRating: number;
    frontDeskRating: number;
    recommendLikelihood: number;
  };
  promotersPct: number;
  waitTime: LabelCount[];
  patientDuration: LabelCount[];
  yesNo: {
    providerTimeAdequate: LabelCount[];
    understandDiagnosis: LabelCount[];
    isPatient: LabelCount[];
  };
  ratingTrend: { date: string; recommend: number; visit: number; count: number }[];
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

function labelCounts(
  rows: AppointmentReviewRow[],
  options: readonly { value: string; label: string }[],
  pick: (row: AppointmentReviewRow) => string,
): LabelCount[] {
  const total = rows.length;
  return options.map(({ value, label }) => {
    const count = rows.filter((r) => pick(r) === value).length;
    return { label, count, pct: total ? Math.round((count / total) * 100) : 0 };
  });
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
  const map = new Map<string, { recommend: number[]; visit: number[] }>();
  for (const row of rows) {
    const date = row.created_at.slice(0, 10);
    const bucket = map.get(date) ?? { recommend: [], visit: [] };
    bucket.recommend.push(row.recommend_likelihood);
    bucket.visit.push(row.visit_rating);
    map.set(date, bucket);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      recommend: Math.round(avg(vals.recommend) * 10) / 10,
      visit: Math.round(avg(vals.visit) * 10) / 10,
      count: vals.recommend.length,
    }));
}

export function buildAppointmentReviewStats(rows: AppointmentReviewRow[]): AppointmentReviewStats {
  const total = rows.length;
  const promoters = rows.filter((r) => r.recommend_likelihood >= APPOINTMENT_REVIEW_MAX_SCORE).length;

  const averages = {
    appointmentEase: Math.round(avg(rows.map((r) => r.appointment_ease)) * 10) / 10,
    visitRating: Math.round(avg(rows.map((r) => r.visit_rating)) * 10) / 10,
    clinicalCareRating: Math.round(avg(rows.map((r) => r.clinical_care_rating)) * 10) / 10,
    frontDeskRating: Math.round(avg(rows.map((r) => r.front_desk_rating)) * 10) / 10,
    recommendLikelihood: Math.round(avg(rows.map((r) => r.recommend_likelihood)) * 10) / 10,
  };

  const ratingScores = [
    { metric: "Appointment ease", score: averages.appointmentEase },
    { metric: "Visit rating", score: averages.visitRating },
    { metric: "Clinical care", score: averages.clinicalCareRating },
    { metric: "Front desk", score: averages.frontDeskRating },
    { metric: "Recommend", score: averages.recommendLikelihood },
  ];

  const commentKinds: { kind: string; pick: (r: AppointmentReviewRow) => string }[] = [
    { kind: "Provider visit", pick: (r) => r.provider_time_comment },
    { kind: "Clinical care", pick: (r) => r.clinical_care_comment },
    { kind: "Exceptional staff", pick: (r) => r.exceptional_staff_comment },
    { kind: "Needs improvement", pick: (r) => r.improvement_staff_comment },
  ];

  const recentComments = rows
    .flatMap((row) =>
      commentKinds
        .map(({ kind, pick }) => ({ id: row.id, createdAt: row.created_at, kind, text: pick(row).trim() }))
        .filter((c) => c.text.length > 0),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  return {
    total,
    averages,
    promotersPct: total ? Math.round((promoters / total) * 100) : 0,
    waitTime: labelCounts(rows, WAIT_TIME_OPTIONS, (r) => r.wait_time),
    patientDuration: labelCounts(rows, PATIENT_DURATION_OPTIONS, (r) => r.patient_duration),
    yesNo: {
      providerTimeAdequate: yesNoCounts(rows, (r) => r.provider_time_adequate),
      understandDiagnosis: yesNoCounts(rows, (r) => r.understand_diagnosis),
      isPatient: yesNoCounts(rows, (r) => r.is_patient),
    },
    ratingTrend: groupByDay(rows),
    ratingScores,
    recentComments,
  };
}
