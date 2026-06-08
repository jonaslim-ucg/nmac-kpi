import type { ArdtsStatus, ArdtsStatusCountsResponse } from "@/lib/ardts/types";

export type ReferralMonthlyPoint = {
  monthIndex: number;
  from: string;
  to: string;
  total: number;
  booked: number;
  booking_pending: number;
  need_help: number;
  completed: number;
  closed: number;
};

export type ReferralYearlyResponse = {
  year: number;
  months: ReferralMonthlyPoint[];
};

export type ReferralFunnelGroup = {
  id: string;
  label: string;
  sub: string;
  statuses: ArdtsStatus[];
};

export const REFERRAL_FUNNEL_GROUPS: ReferralFunnelGroup[] = [
  {
    id: "intake",
    label: "Awaiting booking",
    sub: "Pending + help needed",
    statuses: ["booking_pending", "need_help"],
  },
  {
    id: "scheduled",
    label: "Scheduled",
    sub: "Booked + rescheduled",
    statuses: ["booked", "rescheduled"],
  },
  {
    id: "closed_loop",
    label: "Closed loop",
    sub: "Attended, follow-up, closed",
    statuses: ["completed", "follow_up_pending_confirm", "follow_up_booked", "closed"],
  },
];

export function sumStatuses(counts: Partial<Record<ArdtsStatus, number>>, statuses: ArdtsStatus[]): number {
  return statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
}

export function referralRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function referralMetrics(data: ArdtsStatusCountsResponse) {
  const { total, counts } = data;
  const booked = counts.booked ?? 0;
  const backlog = (counts.booking_pending ?? 0) + (counts.need_help ?? 0);
  const completedLoop =
    (counts.completed ?? 0) +
    (counts.follow_up_pending_confirm ?? 0) +
    (counts.follow_up_booked ?? 0) +
    (counts.closed ?? 0);

  return {
    total,
    booked,
    backlog,
    completedLoop,
    bookingRate: referralRate(booked, total),
    completionRate: referralRate(completedLoop, total),
    attendanceRate: referralRate(counts.completed ?? 0, booked),
    needsActionRate: referralRate(backlog, total),
    helpNeeded: counts.need_help ?? 0,
  };
}

export function funnelGroupCount(
  counts: Partial<Record<ArdtsStatus, number>>,
  group: ReferralFunnelGroup,
): number {
  return sumStatuses(counts, group.statuses);
}
