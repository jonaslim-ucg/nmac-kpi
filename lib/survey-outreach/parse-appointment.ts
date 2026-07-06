/** Parse CRM appointment_date + appointment_time into a UTC instant. */
export function parseCrmAppointmentAt(
  appointmentDate: string | null | undefined,
  appointmentTime: string | null | undefined,
): Date | null {
  if (!appointmentDate) return null;
  const datePart = appointmentDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  if (!appointmentTime?.trim()) {
    const fallback = new Date(`${datePart}T12:00:00.000Z`);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  let timePart = appointmentTime.trim();
  if (!timePart.includes("T")) {
    // Live CRM values look like "07:45:00+00"; docs show bare "09:00:00".
    if (/[+-]\d/.test(timePart)) {
      timePart = timePart.replace(/\+00$/, "+00:00");
    } else {
      timePart = `${timePart}+00:00`;
    }
    timePart = `${datePart}T${timePart}`;
  }

  const parsed = new Date(timePart);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function appointmentAtIso(date: Date): string {
  return date.toISOString();
}
