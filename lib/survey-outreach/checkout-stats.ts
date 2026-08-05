export type DailyCheckoutCountRow = {
  appointment_date: string;
  checkout_count: number;
};

export type DailyCheckoutPoint = {
  date: string;
  count: number;
};

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function buildDailyCheckoutTrend(
  rows: readonly DailyCheckoutCountRow[],
): DailyCheckoutPoint[] {
  const countsByDate = new Map<string, number>();

  for (const row of rows) {
    if (!isCalendarDate(row.appointment_date)) continue;
    if (!Number.isFinite(row.checkout_count) || row.checkout_count < 0) continue;
    countsByDate.set(row.appointment_date, Math.trunc(row.checkout_count));
  }

  return [...countsByDate.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, count]) => ({ date, count }));
}
