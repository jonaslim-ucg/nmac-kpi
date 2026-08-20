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

export const ARDTS_DELIVERY_WORKSTREAMS = ["outgoing", "in_house", "all"] as const;

export type ArdtsDeliveryWorkstream = (typeof ARDTS_DELIVERY_WORKSTREAMS)[number];

export const ARDTS_OPERATIONAL_TYPES = [
  "referral",
  "external_diagnostic",
  "in_house_ultrasound",
  "prescription",
  "all",
] as const;

export type ArdtsOperationalType = (typeof ARDTS_OPERATIONAL_TYPES)[number];

export type ArdtsStatusCard = {
  key: string;
  status: ArdtsStatus | null;
  label: string;
  count: number;
  percent: number;
  description?: string;
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

export type ArdtsWorkstreamMetric = {
  count: number | null;
  percent: number | null;
  applicable: boolean;
};

export type ArdtsWorkstreamComparisonColumn = {
  key: string;
  label: string;
};

export type ArdtsWorkstreamComparisonRow = {
  key: string;
  label: string;
  is_total: boolean;
  total: number;
  metrics: Record<string, ArdtsWorkstreamMetric>;
};

export type ArdtsWorkstreamComparison = {
  columns: ArdtsWorkstreamComparisonColumn[];
  rows: ArdtsWorkstreamComparisonRow[];
};

export type ArdtsWorkstreamSeries = {
  key: string;
  label: string;
};

export type ArdtsTrackedItemsMonth = {
  month: number;
  month_label: string;
  period_from: string;
  period_to: string;
  total: number;
  workstreams: Record<string, number>;
};

export type ArdtsNeedsBookingRate = {
  workstream: string;
  label: string;
  count: number;
  total: number;
  percent: number;
};

export type ArdtsWorkstreamTrends = {
  series: ArdtsWorkstreamSeries[];
  tracked_items_by_month: ArdtsTrackedItemsMonth[];
  needs_booking_rate: ArdtsNeedsBookingRate[];
};

export type ArdtsYearToDateCard = ArdtsWorkstreamMetric & {
  key: string;
  label: string;
  description?: string;
};

export type ArdtsYearToDate = {
  year: number;
  from: string;
  to: string;
  total: number;
  cards: ArdtsYearToDateCard[];
};

export type ArdtsStatusCountsResponse = {
  metadata?: {
    as_of: string;
    period_label: string;
    timezone: string;
    item_type_scope: ArdtsItemType;
    delivery_workstream_scope?: ArdtsDeliveryWorkstream;
    operational_type_scope?: ArdtsOperationalType;
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
  workstream_comparison?: ArdtsWorkstreamComparison;
  workstream_trends?: ArdtsWorkstreamTrends;
  year_to_date?: ArdtsYearToDate;
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
