import assert from "node:assert/strict";
import test from "node:test";
import {
  appointmentReviewActionStatusLabel,
  normalizeAppointmentReviewActionStatus,
  parseAppointmentReviewManagementInput,
} from "../../lib/appointment-review/management.ts";

test("parses and trims staff feedback-management input", () => {
  const result = parseAppointmentReviewManagementInput({
    responsiblePerson: "  Front Desk Team  ",
    status: "in_progress",
    notes: "  Called the patient and left a message.  ",
  });

  assert.deepEqual(result, {
    ok: true,
    input: {
      responsiblePerson: "Front Desk Team",
      status: "in_progress",
      notes: "Called the patient and left a message.",
    },
  });
});

test("rejects invalid feedback-management statuses", () => {
  const result = parseAppointmentReviewManagementInput({
    responsiblePerson: "Staff",
    status: "closed",
    notes: "",
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "Choose a valid action status.");
});

test("normalizes legacy status values and formats labels", () => {
  assert.equal(normalizeAppointmentReviewActionStatus("actioned"), "actioned");
  assert.equal(normalizeAppointmentReviewActionStatus("unknown"), "needs_review");
  assert.equal(appointmentReviewActionStatusLabel("no_action_needed"), "No action needed");
});
