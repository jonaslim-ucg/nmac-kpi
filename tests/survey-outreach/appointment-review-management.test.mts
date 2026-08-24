import assert from "node:assert/strict";
import test from "node:test";
import {
  appointmentReviewActionStatusLabel,
  isAppointmentReviewAssignedTo,
  normalizeAppointmentReviewActionStatus,
  normalizeAppointmentReviewAssigneeEmail,
  parseAppointmentReviewManagementInput,
} from "../../lib/appointment-review/management.ts";

test("parses and trims staff feedback-management input", () => {
  const result = parseAppointmentReviewManagementInput({
    responsiblePerson: "  Front Desk Team  ",
    assignedToEmail: "  Staff.Member@UCG.BM ",
    status: "in_progress",
    notes: "  Called the patient and left a message.  ",
  });

  assert.deepEqual(result, {
    ok: true,
    input: {
      responsiblePerson: "Front Desk Team",
      assignedToEmail: "staff.member@ucg.bm",
      status: "in_progress",
      notes: "Called the patient and left a message.",
    },
  });
});

test("rejects invalid feedback-management statuses", () => {
  const result = parseAppointmentReviewManagementInput({
    responsiblePerson: "Staff",
    assignedToEmail: "staff.member@ucg.bm",
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

test("normalizes assignee emails and matches ownership case-insensitively", () => {
  assert.equal(
    normalizeAppointmentReviewAssigneeEmail(" Patricia.Marketing@UCG.BM "),
    "patricia.marketing@ucg.bm",
  );
  assert.equal(normalizeAppointmentReviewAssigneeEmail("not-an-email"), null);
  assert.equal(
    isAppointmentReviewAssignedTo(
      {
        responsiblePerson: "Patricia Marketing",
        assignedToEmail: "patricia.marketing@ucg.bm",
        status: "needs_review",
        notes: "",
        updatedAt: null,
        updatedBy: null,
      },
      "PATRICIA.MARKETING@UCG.BM",
    ),
    true,
  );
});

test("rejects malformed assignee emails", () => {
  const result = parseAppointmentReviewManagementInput({
    responsiblePerson: "Patricia Marketing",
    assignedToEmail: "patricia",
    status: "needs_review",
    notes: "",
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "Choose a valid assignee.");
});
