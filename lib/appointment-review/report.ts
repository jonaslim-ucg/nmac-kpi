import { parseCrmAppointmentAt } from "../survey-outreach/parse-appointment.ts";

const CLINIC_TIME_ZONE = "Atlantic/Bermuda";
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type AppointmentReviewReportRange = {
  dateStart: string | null;
  dateEnd: string | null;
  startAt?: string;
  endBefore?: string;
};

export type AppointmentReviewReportRangeResult =
  | { ok: true; range: AppointmentReviewReportRange }
  | { ok: false; error: string };

export type SurveyReportOutreachRow = {
  id: string;
  crm_appointment_id: string | null;
  crm_appointment_ids: string[] | null;
  appointment_date: string | null;
  appointment_at: string | null;
  appointment_providers: Record<string, string> | null;
  provider_names: string[] | null;
  initial_sent_at: string | null;
  completed_at: string | null;
};

export type ProviderAppointmentReport = {
  providerName: string;
  appointmentCount: number;
  surveySentCount: number;
  responseCount: number;
  appointmentCountEstimated: boolean;
};

export type SurveyAppointmentReport = {
  outreachId: string;
  appointmentDate: string | null;
  appointmentAt: string | null;
  appointmentIds: string[];
  appointmentCount: number;
  providerNames: string[];
  providerCount: number;
  providerAppointments: { appointmentId: string; providerName: string }[];
  providerMappingComplete: boolean;
  initialSentAt: string | null;
  respondedAt: string | null;
};

function clinicCalendarDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function validCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function clinicDayStart(value: string): string {
  const parsed = parseCrmAppointmentAt(value, "00:00:00");
  if (!parsed) throw new Error(`Invalid clinic calendar date: ${value}`);
  return parsed.toISOString();
}

function customDateParam(searchParams: URLSearchParams, primary: string, alias: string): string | null {
  return searchParams.get(primary) ?? searchParams.get(alias);
}

/** Parse inclusive clinic-calendar date filters used by the survey report endpoint. */
export function parseAppointmentReviewReportRange(
  searchParams: URLSearchParams,
  now = new Date(),
): AppointmentReviewReportRangeResult {
  const dateStart = customDateParam(searchParams, "dateStart", "startDate");
  const dateEnd = customDateParam(searchParams, "dateEnd", "endDate");

  if (dateStart !== null || dateEnd !== null) {
    if (dateStart !== null && !validCalendarDate(dateStart)) {
      return { ok: false, error: "dateStart must use YYYY-MM-DD." };
    }
    if (dateEnd !== null && !validCalendarDate(dateEnd)) {
      return { ok: false, error: "dateEnd must use YYYY-MM-DD." };
    }
    if (dateStart && dateEnd && dateStart > dateEnd) {
      return { ok: false, error: "dateStart must be on or before dateEnd." };
    }
    return {
      ok: true,
      range: {
        dateStart,
        dateEnd,
        ...(dateStart ? { startAt: clinicDayStart(dateStart) } : {}),
        ...(dateEnd ? { endBefore: clinicDayStart(addCalendarDays(dateEnd, 1)) } : {}),
      },
    };
  }

  if (searchParams.get("range") === "quarter") {
    const clinicToday = clinicCalendarDate(now);
    const [year, month] = clinicToday.split("-").map(Number);
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const start = `${year}-${String(quarterStartMonth).padStart(2, "0")}-01`;
    const nextQuarterYear = quarterStartMonth === 10 ? year + 1 : year;
    const nextQuarterMonth = quarterStartMonth === 10 ? 1 : quarterStartMonth + 3;
    const nextQuarter = `${nextQuarterYear}-${String(nextQuarterMonth).padStart(2, "0")}-01`;
    return {
      ok: true,
      range: {
        dateStart: start,
        dateEnd: addCalendarDays(nextQuarter, -1),
        startAt: clinicDayStart(start),
        endBefore: clinicDayStart(nextQuarter),
      },
    };
  }

  const daysRaw = searchParams.get("days");
  if (daysRaw !== null) {
    const days = Number(daysRaw);
    if (!Number.isInteger(days) || days <= 0) {
      return { ok: false, error: "days must be a positive whole number." };
    }
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      ok: true,
      range: {
        dateStart: clinicCalendarDate(start),
        dateEnd: clinicCalendarDate(now),
        startAt: start.toISOString(),
        endBefore: now.toISOString(),
      },
    };
  }

  return { ok: true, range: { dateStart: null, dateEnd: null } };
}

function cleanUnique(values: readonly (string | null | undefined)[]): string[] {
  const found = new Map<string, string>();
  for (const value of values) {
    const clean = value?.trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase();
    if (!found.has(key)) found.set(key, clean);
  }
  return [...found.values()];
}

function appointmentIds(row: SurveyReportOutreachRow): string[] {
  const ids = Array.isArray(row.crm_appointment_ids) ? row.crm_appointment_ids : [];
  return cleanUnique([...ids, row.crm_appointment_id]);
}

function validAppointmentProviders(row: SurveyReportOutreachRow): { appointmentId: string; providerName: string }[] {
  if (!row.appointment_providers || typeof row.appointment_providers !== "object") return [];
  return Object.entries(row.appointment_providers).flatMap(([appointmentId, providerName]) => {
    const cleanId = appointmentId.trim();
    const cleanProvider = typeof providerName === "string" ? providerName.trim() : "";
    return cleanId && cleanProvider ? [{ appointmentId: cleanId, providerName: cleanProvider }] : [];
  });
}

function providerCountsForRow(row: SurveyReportOutreachRow): {
  counts: Map<string, { providerName: string; count: number; estimated: boolean }>;
  assignments: { appointmentId: string; providerName: string }[];
  mappingComplete: boolean;
} {
  const ids = appointmentIds(row);
  const storedProviders = cleanUnique(Array.isArray(row.provider_names) ? row.provider_names : []);
  const assignments = validAppointmentProviders(row);
  const mappedIds = new Set(assignments.map((item) => item.appointmentId));
  const counts = new Map<string, { providerName: string; count: number; estimated: boolean }>();

  function increment(providerName: string, count: number, estimated: boolean): void {
    const key = providerName.toLocaleLowerCase();
    const current = counts.get(key);
    counts.set(key, {
      providerName: current?.providerName ?? providerName,
      count: (current?.count ?? 0) + count,
      estimated: Boolean(current?.estimated || estimated),
    });
  }

  for (const assignment of assignments) increment(assignment.providerName, 1, false);

  const mappedProviderKeys = new Set(assignments.map((item) => item.providerName.toLocaleLowerCase()));
  const missingProviders = storedProviders.filter(
    (providerName) => !mappedProviderKeys.has(providerName.toLocaleLowerCase()),
  );
  const unmappedIds = ids.filter((id) => !mappedIds.has(id));

  if (missingProviders.length === 1 && assignments.length === 0) {
    increment(missingProviders[0], Math.max(ids.length, 1), ids.length > 1);
  } else {
    for (const providerName of missingProviders) increment(providerName, 1, true);
  }

  return {
    counts,
    assignments,
    mappingComplete:
      (missingProviders.length === 0 && unmappedIds.length === 0) ||
      (assignments.length === 0 && missingProviders.length === 1 && ids.length <= 1),
  };
}

export function buildProviderAppointmentReport(rows: readonly SurveyReportOutreachRow[]): {
  providers: ProviderAppointmentReport[];
  appointments: SurveyAppointmentReport[];
} {
  const providerTotals = new Map<string, ProviderAppointmentReport>();
  const appointments = rows.map((row) => {
    const ids = appointmentIds(row);
    const providerData = providerCountsForRow(row);
    const rowProviderNames = cleanUnique([
      ...(Array.isArray(row.provider_names) ? row.provider_names : []),
      ...providerData.assignments.map((item) => item.providerName),
    ]);

    for (const provider of providerData.counts.values()) {
      const key = provider.providerName.toLocaleLowerCase();
      const current = providerTotals.get(key);
      providerTotals.set(key, {
        providerName: current?.providerName ?? provider.providerName,
        appointmentCount: (current?.appointmentCount ?? 0) + provider.count,
        surveySentCount: (current?.surveySentCount ?? 0) + (row.initial_sent_at ? 1 : 0),
        responseCount: (current?.responseCount ?? 0) + (row.completed_at ? 1 : 0),
        appointmentCountEstimated: Boolean(current?.appointmentCountEstimated || provider.estimated),
      });
    }

    return {
      outreachId: row.id,
      appointmentDate: row.appointment_date,
      appointmentAt: row.appointment_at,
      appointmentIds: ids,
      appointmentCount: Math.max(ids.length, 1),
      providerNames: rowProviderNames,
      providerCount: rowProviderNames.length,
      providerAppointments: providerData.assignments,
      providerMappingComplete: providerData.mappingComplete,
      initialSentAt: row.initial_sent_at,
      respondedAt: row.completed_at,
    };
  });

  const providers = [...providerTotals.values()].sort(
    (a, b) => b.appointmentCount - a.appointmentCount || a.providerName.localeCompare(b.providerName),
  );

  return { providers, appointments };
}
