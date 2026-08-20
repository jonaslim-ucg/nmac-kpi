export const APPOINTMENT_REVIEW_ACTION_STATUS_OPTIONS = [
  { value: "needs_review", label: "Needs review" },
  { value: "in_progress", label: "In progress" },
  { value: "actioned", label: "Actioned" },
  { value: "no_action_needed", label: "No action needed" },
] as const;

export type AppointmentReviewActionStatus =
  (typeof APPOINTMENT_REVIEW_ACTION_STATUS_OPTIONS)[number]["value"];

export type AppointmentReviewManagement = {
  responsiblePerson: string;
  status: AppointmentReviewActionStatus;
  notes: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type AppointmentReviewManagementInput = Pick<
  AppointmentReviewManagement,
  "responsiblePerson" | "status" | "notes"
>;

export const EMPTY_APPOINTMENT_REVIEW_MANAGEMENT: AppointmentReviewManagement = {
  responsiblePerson: "",
  status: "needs_review",
  notes: "",
  updatedAt: null,
  updatedBy: null,
};

const ACTION_STATUS_VALUES = new Set<AppointmentReviewActionStatus>(
  APPOINTMENT_REVIEW_ACTION_STATUS_OPTIONS.map((option) => option.value),
);

export function normalizeAppointmentReviewActionStatus(
  value: unknown,
): AppointmentReviewActionStatus {
  return typeof value === "string" && ACTION_STATUS_VALUES.has(value as AppointmentReviewActionStatus)
    ? (value as AppointmentReviewActionStatus)
    : "needs_review";
}

export function appointmentReviewActionStatusLabel(
  status: AppointmentReviewActionStatus,
): string {
  return APPOINTMENT_REVIEW_ACTION_STATUS_OPTIONS.find((option) => option.value === status)?.label
    ?? "Needs review";
}

export function parseAppointmentReviewManagementInput(
  value: unknown,
): { ok: true; input: AppointmentReviewManagementInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Invalid feedback-management details." };
  }

  const body = value as Record<string, unknown>;
  const responsiblePerson = typeof body.responsiblePerson === "string"
    ? body.responsiblePerson.trim()
    : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const status = body.status;

  if (responsiblePerson.length > 120) {
    return { ok: false, error: "Responsible person must be 120 characters or fewer." };
  }
  if (notes.length > 5_000) {
    return { ok: false, error: "Notes must be 5,000 characters or fewer." };
  }
  if (typeof status !== "string" || !ACTION_STATUS_VALUES.has(status as AppointmentReviewActionStatus)) {
    return { ok: false, error: "Choose a valid action status." };
  }

  return {
    ok: true,
    input: {
      responsiblePerson,
      status: status as AppointmentReviewActionStatus,
      notes,
    },
  };
}
