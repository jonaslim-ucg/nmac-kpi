export type DailyOutreachAppointment = {
  crmAppointmentId: string;
  patientAccNumber: string | null;
  patientEmail: string;
  patientName: string;
  appointmentDate: string;
  appointmentAt: string;
  providerName: string | null;
  visitType: string | null;
};

export type DailyOutreachGroup = {
  groupKey: string;
  patientAccNumber: string | null;
  patientEmail: string;
  patientName: string;
  appointmentDate: string;
  appointmentAt: string;
  crmAppointmentId: string;
  appointmentIds: string[];
  appointmentProviders: Record<string, string>;
  providerNames: string[];
  visitTypes: string[];
};

function normalizedKeyPart(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase().replace(/\s+/g, " "));
}

export function dailyOutreachGroupKey(input: {
  patientAccNumber: string | null;
  patientEmail: string;
  patientName: string;
  appointmentDate: string;
}): string {
  const account = input.patientAccNumber?.trim();
  const identity = account
    ? `account:${normalizedKeyPart(account)}`
    : `contact:${normalizedKeyPart(input.patientEmail)}:${normalizedKeyPart(input.patientName)}`;
  return `${identity}:date:${input.appointmentDate}`;
}

function addUnique(values: string[], value: string | null): void {
  const clean = value?.trim();
  if (!clean) return;
  if (!values.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
    values.push(clean);
  }
}

export function groupDailyOutreachAppointments(
  appointments: DailyOutreachAppointment[],
): DailyOutreachGroup[] {
  const sorted = [...appointments].sort((a, b) => {
    const byTime = a.appointmentAt.localeCompare(b.appointmentAt);
    return byTime || a.crmAppointmentId.localeCompare(b.crmAppointmentId);
  });
  const groups = new Map<string, DailyOutreachGroup>();

  for (const appointment of sorted) {
    const groupKey = dailyOutreachGroupKey(appointment);
    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        groupKey,
        patientAccNumber: appointment.patientAccNumber,
        patientEmail: appointment.patientEmail,
        patientName: appointment.patientName,
        appointmentDate: appointment.appointmentDate,
        appointmentAt: appointment.appointmentAt,
        crmAppointmentId: appointment.crmAppointmentId,
        appointmentIds: [appointment.crmAppointmentId],
        appointmentProviders: appointment.providerName
          ? { [appointment.crmAppointmentId]: appointment.providerName.trim() }
          : {},
        providerNames: appointment.providerName ? [appointment.providerName.trim()] : [],
        visitTypes: appointment.visitType ? [appointment.visitType.trim()] : [],
      });
      continue;
    }

    addUnique(existing.appointmentIds, appointment.crmAppointmentId);
    if (appointment.providerName?.trim()) {
      existing.appointmentProviders[appointment.crmAppointmentId] = appointment.providerName.trim();
    }
    addUnique(existing.providerNames, appointment.providerName);
    addUnique(existing.visitTypes, appointment.visitType);

    if (appointment.appointmentAt >= existing.appointmentAt) {
      existing.appointmentAt = appointment.appointmentAt;
      existing.patientEmail = appointment.patientEmail;
      existing.patientName = appointment.patientName;
      existing.patientAccNumber = appointment.patientAccNumber ?? existing.patientAccNumber;
    }
  }

  return [...groups.values()].sort((a, b) => a.appointmentAt.localeCompare(b.appointmentAt));
}
