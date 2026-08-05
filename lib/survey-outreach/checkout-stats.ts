export type DailyCheckoutCountRow = {
  appointment_date: string;
  checkout_count: number;
};

export type DailyCheckoutStats = {
  total: number;
  trackedDays: number;
  averagePerDay: number;
};

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function summarizeDailyCheckouts(
  rows: readonly DailyCheckoutCountRow[],
): DailyCheckoutStats {
  const countsByDate = new Map<string, number>();

  for (const row of rows) {
    if (!CALENDAR_DATE_PATTERN.test(row.appointment_date)) continue;
    if (!Number.isFinite(row.checkout_count) || row.checkout_count < 0) continue;
    countsByDate.set(row.appointment_date, Math.trunc(row.checkout_count));
  }

  const total = [...countsByDate.values()].reduce((sum, count) => sum + count, 0);
  const trackedDays = countsByDate.size;
  return {
    total,
    trackedDays,
    averagePerDay: trackedDays ? Math.round((total / trackedDays) * 10) / 10 : 0,
  };
}
