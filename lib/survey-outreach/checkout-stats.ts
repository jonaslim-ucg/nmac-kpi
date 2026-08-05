import type { CrmAppointmentRow } from "@/lib/crm/appointments";

export type DailyCheckoutSurveyGroup = {
  appointmentIds: string[];
  hasEmail: boolean;
};

export type DailyCheckoutCountRow = {
  appointment_date: string;
  checkout_count: number;
  distinct_patient_count?: number | null;
  eligible_survey_count?: number | null;
  no_email_count?: number | null;
  survey_groups?: DailyCheckoutSurveyGroup[] | null;
};

export type DailyCheckoutPoint = {
  date: string;
  count: number;
};

export type CheckoutSummary = {
  checkouts: number;
  multipleSameDayAppointments: number | null;
};

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizedIdentityPart(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function checkoutPatientKey(row: CrmAppointmentRow): string {
  const account = normalizedIdentityPart(row.patient_acc_number);
  if (account) return `account:${account}`;

  const email = normalizedIdentityPart(row.patient_email);
  const name = normalizedIdentityPart(row.patient_name);
  if (email) return `contact:${email}:${name}`;

  if (name) return `name:${name}`;

  return row.id ? `appointment:${row.id}` : "unknown";
}

/** Build the patient-day checkout snapshot used to reconcile survey delivery. */
export function buildDailyCheckoutSnapshot(
  appointmentDate: string,
  rows: readonly CrmAppointmentRow[],
): DailyCheckoutCountRow {
  const groups = new Map<string, DailyCheckoutSurveyGroup>();

  for (const row of rows) {
    const key = checkoutPatientKey(row);
    const existing = groups.get(key) ?? { appointmentIds: [], hasEmail: false };
    if (row.id !== null && row.id !== undefined) {
      const appointmentId = String(row.id);
      if (!existing.appointmentIds.includes(appointmentId)) {
        existing.appointmentIds.push(appointmentId);
      }
    }
    existing.hasEmail ||= Boolean(row.patient_email?.trim());
    groups.set(key, existing);
  }

  const surveyGroups = [...groups.values()]
    .map((group) => ({
      appointmentIds: [...group.appointmentIds].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
      hasEmail: group.hasEmail,
    }))
    .sort((a, b) =>
      (a.appointmentIds[0] ?? "").localeCompare(
        b.appointmentIds[0] ?? "",
        undefined,
        { numeric: true },
      ),
    );
  const eligibleSurveyCount = surveyGroups.filter((group) => group.hasEmail).length;

  return {
    appointment_date: appointmentDate,
    checkout_count: rows.length,
    distinct_patient_count: surveyGroups.length,
    eligible_survey_count: eligibleSurveyCount,
    no_email_count: surveyGroups.length - eligibleSurveyCount,
    survey_groups: surveyGroups,
  };
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

/** Summarize check-outs and extra same-day appointments for the selected dates. */
export function summarizeDailyCheckouts(
  rows: readonly DailyCheckoutCountRow[],
): CheckoutSummary {
  const snapshotsByDate = new Map<
    string,
    { checkouts: number; distinctPatients: number | null }
  >();

  for (const row of rows) {
    if (!isCalendarDate(row.appointment_date)) continue;
    if (!Number.isFinite(row.checkout_count) || row.checkout_count < 0) continue;

    const checkouts = Math.trunc(row.checkout_count);
    const distinctPatients =
      typeof row.distinct_patient_count === "number"
      && Number.isFinite(row.distinct_patient_count)
      && row.distinct_patient_count >= 0
        ? Math.min(checkouts, Math.trunc(row.distinct_patient_count))
        : null;

    snapshotsByDate.set(row.appointment_date, { checkouts, distinctPatients });
  }

  let checkouts = 0;
  let multipleSameDayAppointments = 0;
  let hasCompletePatientCounts = true;

  for (const snapshot of snapshotsByDate.values()) {
    checkouts += snapshot.checkouts;
    if (snapshot.distinctPatients === null) {
      hasCompletePatientCounts = false;
      continue;
    }
    multipleSameDayAppointments += snapshot.checkouts - snapshot.distinctPatients;
  }

  return {
    checkouts,
    multipleSameDayAppointments: hasCompletePatientCounts
      ? multipleSameDayAppointments
      : null,
  };
}
