import type { ArdtsStatus, ArdtsStatusCard } from "@/lib/ardts/types";

export function monthDateBounds(year: number, monthIndex: number): { from: string; to: string } {
  const month = String(monthIndex + 1).padStart(2, "0");
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

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

export const REFERRAL_ALL_STATUS_CARD_KEYS = [
  "total",
  "needs_appt_booking",
  "initial_appt_booked",
  "referral_appt_attended",
  "diagnostic_appt_attended",
  "initial_appt_not_attended",
  "rescheduled",
  "results_fu_needed",
  "results_fu_pending_confirmation",
  "results_fu_booked",
  "results_fu_attended",
  "refused",
] as const;

const REFERRAL_ALL_STATUS_CARD_RANK = new Map<string, number>(
  REFERRAL_ALL_STATUS_CARD_KEYS.map((key, index) => [key, index]),
);

/** Preserve the documented All-tab sequence while retaining any future server cards. */
export function orderReferralStatusCards(cards: readonly ArdtsStatusCard[]): ArdtsStatusCard[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const aRank = REFERRAL_ALL_STATUS_CARD_RANK.get(a.card.key) ?? Number.MAX_SAFE_INTEGER;
      const bRank = REFERRAL_ALL_STATUS_CARD_RANK.get(b.card.key) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank || a.index - b.index;
    })
    .map(({ card }) => card);
}

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
