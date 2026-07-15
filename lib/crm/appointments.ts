/** One row from `appointment_data` — see CRM status-counts API docs. */
export type CrmAppointmentRow = {
  id: number | null;
  appointment_date: string | null;
  appointment_time: string | null;
  visit_status: string;
  visit_status_label: string;
  visit_type: string | null;
  patient_name: string | null;
  patient_acc_number: string | null;
  patient_email: string | null;
  appointment_provider_name: string | null;
  resource_provider_name: string | null;
};

export type CrmStatusBucket = {
  code: string;
  label: string;
  count: number;
};

export type CrmStatusCountsResponse = {
  date: string;
  requested_status: string;
  total: number;
  statuses: CrmStatusBucket[];
  appointment_data: CrmAppointmentRow[];
};

export type CrmAiConfirmationRateResponse = {
  key: "ai_confirmation_rate";
  label: string;
  year: number;
  month: number;
  date_from: string;
  date_to: string;
  snapshot_days: number;
  numerator: number;
  denominator: number;
  rate_pct: number | null;
};

export class CrmConfigError extends Error {
  constructor() {
    super("NMAC CRM reports API is not configured.");
    this.name = "CrmConfigError";
  }
}

function crmBaseUrl(): string {
  const base = process.env.NMAC_CRM_BASE_URL?.trim().replace(/\/$/, "") || "https://crm.nmac.bm";
  return base;
}

function crmToken(): string {
  const token = process.env.REPORTS_API_TOKEN?.trim();
  if (!token) throw new CrmConfigError();
  return token;
}

export async function fetchCrmStatusCounts(
  date: string,
  status: "CHK" | "all" = "CHK",
): Promise<CrmStatusCountsResponse> {
  const url = new URL(`${crmBaseUrl()}/api/reports/appointments/status-counts`);
  url.searchParams.set("date", date);
  url.searchParams.set("status", status);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${crmToken()}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  let body: CrmStatusCountsResponse | { detail?: string };
  try {
    body = (await res.json()) as CrmStatusCountsResponse | { detail?: string };
  } catch {
    throw new Error(`CRM API HTTP ${res.status} (non-JSON response)`);
  }

  if (!res.ok) {
    const message =
      typeof body === "object" && body && "detail" in body && typeof body.detail === "string"
        ? body.detail
        : `CRM API HTTP ${res.status}`;
    throw new Error(message);
  }

  return body as CrmStatusCountsResponse;
}

export async function fetchCrmAppointments(
  date: string,
  status: "CHK" | "all" = "CHK",
): Promise<CrmAppointmentRow[]> {
  const body = await fetchCrmStatusCounts(date, status);
  return body.appointment_data ?? [];
}

export async function fetchCrmAiConfirmationRate(
  year: number,
  month: number,
): Promise<CrmAiConfirmationRateResponse> {
  const url = new URL(`${crmBaseUrl()}/api/reports/kpis/ai-confirmation-rate`);
  url.searchParams.set("year", String(year));
  url.searchParams.set("month", String(month));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${crmToken()}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  let body: CrmAiConfirmationRateResponse | { detail?: string; error?: string };
  try {
    body = (await res.json()) as CrmAiConfirmationRateResponse | { detail?: string; error?: string };
  } catch {
    const contentType = res.headers.get("content-type") ?? "unknown content type";
    throw new Error(`CRM AI confirmation endpoint returned ${contentType} instead of JSON.`);
  }

  if (!res.ok) {
    const message =
      typeof body === "object" && body && "detail" in body && typeof body.detail === "string"
        ? body.detail
        : typeof body === "object" && body && "error" in body && typeof body.error === "string"
          ? body.error
          : `CRM API HTTP ${res.status}`;
    throw new Error(message);
  }

  return body as CrmAiConfirmationRateResponse;
}

const BERMUDA_TZ = "Atlantic/Bermuda";

function bermudaCalendarDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BERMUDA_TZ }).format(d);
}

/** Recent appointment dates in Bermuda local calendar (clinic timezone). */
export function crmSyncDates(now = new Date(), lookbackDays = 3): string[] {
  const dates: string[] = [];
  for (let i = 0; i <= lookbackDays; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(bermudaCalendarDate(d));
  }
  return dates;
}
