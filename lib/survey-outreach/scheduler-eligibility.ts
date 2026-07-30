export type SurveyOutreachSchedulerMode = "production" | "test";

export type SurveyOutreachSourceRow = {
  is_test: boolean;
  crm_appointment_id: string | null;
  crm_appointment_ids?: string[] | null;
};

function isRealCrmAppointmentId(value: string | null | undefined): boolean {
  const id = value?.trim();
  return Boolean(id && !id.toLowerCase().startsWith("test-"));
}

export function isEndpointCheckoutOutreach(row: SurveyOutreachSourceRow): boolean {
  if (row.is_test) return false;
  return [row.crm_appointment_id, ...(row.crm_appointment_ids ?? [])]
    .some(isRealCrmAppointmentId);
}

export function schedulerModeAllowsOutreach(
  row: SurveyOutreachSourceRow,
  mode: SurveyOutreachSchedulerMode,
): boolean {
  return mode === "test" ? row.is_test : isEndpointCheckoutOutreach(row);
}
