import type { ArdtsStatus } from "@/lib/ardts/types";

export function monthDateBounds(year: number, monthIndex: number): { from: string; to: string } {
  const month = String(monthIndex + 1).padStart(2, "0");
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export type ReferralRangeMode = "month" | "last_7_days" | "last_30_days" | "this_month";

export const REFERRAL_RANGE_OPTIONS: Array<{ id: ReferralRangeMode; label: string }> = [
  { id: "month", label: "Selected month" },
  { id: "last_7_days", label: "Last 7 days" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "this_month", label: "This month" },
];

export type ReferralStatusCard = {
  key: ArdtsStatus | "total";
  label: string;
  sub: string;
};

export const REFERRAL_STATUS_CARDS: ReferralStatusCard[] = [
  { key: "total", label: "Total", sub: "Referrals sent in period" },
  { key: "booking_pending", label: "Booking Pending", sub: "Awaiting appointment" },
  { key: "need_help", label: "Booking Help Needed", sub: "Needs booking support" },
  { key: "booked", label: "Booked", sub: "Appointment scheduled" },
  { key: "rescheduled", label: "Rescheduled", sub: "Needs new date" },
  { key: "completed", label: "Appt. Attended", sub: "Visit completed" },
  { key: "follow_up_pending_confirm", label: "Follow Up Pending Confirm", sub: "Follow-up requested" },
  { key: "follow_up_booked", label: "Completed", sub: "Follow-up scheduled" },
  { key: "closed", label: "Closed", sub: "Workflow closed" },
];

export function referralCountForCard(
  key: ReferralStatusCard["key"],
  total: number,
  counts: Partial<Record<ArdtsStatus, number>>,
): number {
  if (key === "total") return total;
  return counts[key] ?? 0;
}

export function referralBookingRate(total: number, booked: number): string {
  if (total <= 0) return "—";
  return `${Math.round((booked / total) * 100)}%`;
}
