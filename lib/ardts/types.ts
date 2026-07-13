export const ARDTS_RANGE_PRESETS = [
  "today",
  "last_7_days",
  "last_30_days",
  "this_month",
  "custom",
] as const;

export type ArdtsRangePreset = (typeof ARDTS_RANGE_PRESETS)[number];
export type ArdtsResolvedRangePreset = ArdtsRangePreset | "month";

export const ARDTS_STATUSES = [
  "sent",
  "booking_pending",
  "need_help",
  "booked",
  "rescheduled",
  "completed",
  "appt_not_attended",
  "results_follow_up_needed",
  "follow_up_pending_confirm",
  "follow_up_booked",
  "closed_loop",
  "closed",
] as const;

export type ArdtsStatus = (typeof ARDTS_STATUSES)[number];

export const ARDTS_ITEM_TYPES = ["referral", "diagnostic", "prescription", "all"] as const;

export type ArdtsItemType = (typeof ARDTS_ITEM_TYPES)[number];

export type ArdtsStatusCard = {
  key: string;
  status: ArdtsStatus | null;
  label: string;
  count: number;
  percent: number;
};

export type ArdtsPipelineStage = {
  key: string;
  label: string;
  count: number;
  percent: number;
};

export type ArdtsMonthlySentPoint = {
  month: number;
  month_label: string;
  period_from: string;
  period_to: string;
  sent: number;
};

export type ArdtsMonthlyOutcomePoint = {
  month: number;
  month_label: string;
  period_from: string;
  period_to: string;
  booked_or_beyond: number;
  needs_action: number;
};

export type ArdtsStatusCountsResponse = {
  metadata?: {
    as_of: string;
    period_label: string;
    timezone: string;
    item_type_scope: ArdtsItemType;
    date_field: string;
  };
  all_statuses_in_period?: {
    total: number;
    counts: Partial<Record<ArdtsStatus, number>>;
    cards: ArdtsStatusCard[];
  };
  period_summary?: {
    sent_in_period: number;
    booking_rate: number | null;
    completion_rate: number | null;
    finish_rate: number | null;
    needs_action: {
      count: number;
      percent: number;
    };
    ytd_sent: number;
    ytd_booked: number;
  };
  pipeline_stages?: ArdtsPipelineStage[];
  charts?: {
    referrals_sent_by_month?: ArdtsMonthlySentPoint[];
    booked_vs_needs_action?: ArdtsMonthlyOutcomePoint[];
    status_breakdown_selected_period?: ArdtsStatusCard[];
  };
  range: {
    preset: ArdtsResolvedRangePreset;
    from: string;
    to: string;
    date_field: string;
    business_hours_applied: boolean;
    timezone: string;
    company_hours: {
      weekdays: number[];
      start_time: string;
      end_time: string;
    };
    utc_bounds: {
      startUtc: string;
      endUtc: string;
    };
    selected_year?: number;
  };
  status_filter: string | string[];
  total: number;
  counts: Partial<Record<ArdtsStatus, number>>;
  statuses: Array<{
    status: ArdtsStatus;
    label: string;
    count: number;
  }>;
};

export type ArdtsStatusCountsErrorBody = {
  error?: string;
  valid_ranges?: ArdtsRangePreset[];
};
