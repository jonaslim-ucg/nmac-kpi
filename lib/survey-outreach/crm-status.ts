import type { CrmAppointmentRow } from "@/lib/crm/appointments";

export type OutreachAppointmentLinks = {
  id: string;
  crm_appointment_id: string | null;
  crm_appointment_ids: string[] | null;
};

export function isCheckedOutVisitStatus(status: string | null | undefined): boolean {
  return status?.trim().toUpperCase() === "CHK";
}

export function isCheckedOutCrmAppointment(row: CrmAppointmentRow): boolean {
  return isCheckedOutVisitStatus(row.visit_status);
}

function linkedAppointmentIds(row: OutreachAppointmentLinks): string[] {
  const ids = Array.isArray(row.crm_appointment_ids) ? row.crm_appointment_ids : [];
  return [...new Set([...ids, row.crm_appointment_id]
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id)))];
}

/**
 * Suppress only when CRM explicitly reports every known linked appointment as
 * something other than checked out. Missing appointment rows remain untouched.
 */
export function outreachIdsNoLongerCheckedOut(
  rows: readonly OutreachAppointmentLinks[],
  currentStatusByAppointmentId: ReadonlyMap<string, string>,
): string[] {
  return rows.flatMap((row) => {
    const appointmentIds = linkedAppointmentIds(row);
    const statuses = appointmentIds.map((appointmentId) =>
      currentStatusByAppointmentId.get(appointmentId));
    if (
      statuses.length === 0
      || statuses.some((status) => status === undefined)
      || statuses.some(isCheckedOutVisitStatus)
    ) return [];
    return [row.id];
  });
}
