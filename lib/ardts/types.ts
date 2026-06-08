export const ARDTS_RANGE_PRESETS = [
  "today",
  "last_7_days",
  "last_30_days",
  "this_month",
  "custom",
] as const;

export type ArdtsRangePreset = (typeof ARDTS_RANGE_PRESETS)[number];

export const ARDTS_STATUSES = [
  "sent",
  "booking_pending",
  "need_help",
  "booked",
  "completed",
  "follow_up_pending_confirm",
  "follow_up_booked",
  "closed",
  "rescheduled",
] as const;

export type ArdtsStatus = (typeof ARDTS_STATUSES)[number];

export type ArdtsStatusCountsResponse = {
  range: {
    preset: ArdtsRangePreset;
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
  };
  status_filter: string | string[];
  total: number;
  counts: Record<ArdtsStatus, number>;
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
