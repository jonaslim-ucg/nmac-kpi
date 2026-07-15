const CLINIC_TIME_ZONE = "Atlantic/Bermuda";

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return representedAsUtc - instant.getTime();
}

function clinicLocalDateTimeToUtc(datePart: string, timePart: string): Date | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(timePart);
  if (!match) return null;

  const [year, month, day] = datePart.split("-").map(Number);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  const millisecond = Number((match[4] ?? "0").padEnd(3, "0"));
  if (hour > 23 || minute > 59 || second > 59) return null;

  const dateCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    dateCheck.getUTCFullYear() !== year ||
    dateCheck.getUTCMonth() !== month - 1 ||
    dateCheck.getUTCDate() !== day
  ) {
    return null;
  }

  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let instant = new Date(wallClockUtc);
  for (let i = 0; i < 2; i++) {
    instant = new Date(wallClockUtc - timeZoneOffsetMs(instant, CLINIC_TIME_ZONE));
  }
  return Number.isFinite(instant.getTime()) ? instant : null;
}

/** Parse CRM appointment date/time into an instant, treating bare times as Bermuda local time. */
export function parseCrmAppointmentAt(
  appointmentDate: string | null | undefined,
  appointmentTime: string | null | undefined,
): Date | null {
  if (!appointmentDate) return null;
  const datePart = appointmentDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  if (!appointmentTime?.trim()) {
    return clinicLocalDateTimeToUtc(datePart, "12:00:00");
  }

  const rawTime = appointmentTime.trim();
  const hasExplicitOffset = /[zZ]|[+-]\d{2}(?::?\d{2})?$/.test(rawTime);
  if (!rawTime.includes("T") && !hasExplicitOffset) {
    return clinicLocalDateTimeToUtc(datePart, rawTime);
  }
  if (rawTime.includes("T") && !hasExplicitOffset) {
    const localDateTime = /^(\d{4}-\d{2}-\d{2})T(.+)$/.exec(rawTime);
    return localDateTime
      ? clinicLocalDateTimeToUtc(localDateTime[1], localDateTime[2])
      : null;
  }

  let timePart = rawTime.includes("T") ? rawTime : `${datePart}T${rawTime}`;
  timePart = timePart.replace(/([+-]\d{2})$/, "$1:00");
  const parsed = new Date(timePart);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function appointmentAtIso(date: Date): string {
  return date.toISOString();
}
