import { APPOINTMENT_REVIEW_MAX_SCORE } from "@/lib/appointment-review/types";

export type AppointmentReviewRow = {
  id: string;
  created_at: string;
  appointment_ease: number;
  visit_rating: number;
  provider_and_services: string;
  health_improvement: string;
  recommendation_message: string;
};

export type AppointmentReviewStats = {
  total: number;
  averages: {
    appointmentEase: number;
    visitRating: number;
  };
  topVisitRatingPct: number;
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
  };

  const ratingScores = [
    { metric: "Scheduling ease", score: averages.appointmentEase },
    { metric: "Overall visit", score: averages.visitRating },
  ];

  const commentKinds: { kind: string; pick: (r: AppointmentReviewRow) => string }[] = [
    { kind: "Provider & services", pick: (r) => r.provider_and_services },
    { kind: "Health & quality of life", pick: (r) => r.health_improvement },
    { kind: "Recommendation", pick: (r) => r.recommendation_message },
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
    topVisitRatingPct: total ? Math.round((topVisit / total) * 100) : 0,
    ratingTrend: groupByDay(rows),
    ratingScores,
    recentComments,
  };
}
