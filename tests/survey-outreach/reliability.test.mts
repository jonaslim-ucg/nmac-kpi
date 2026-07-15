import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SURVEY_SEND_ATTEMPTS,
  surveySendRetryAt,
} from "../../lib/survey-outreach/reliability.ts";
import {
  initialSurveyDueAt,
  noEarlierThanMinimumMessageGap,
  normalizeSurveyOutreachSchedule,
  scheduleDelays,
  validateSurveyOutreachScheduleInput,
} from "../../lib/survey-outreach/schedule.ts";

const APPROVED_SCHEDULE = {
  initialDelayHours: 24,
  reminder1Days: 3,
  reminder2Days: 7,
  finalReminderDays: 14,
};

test("schedules the initial survey from the last appointment timestamp", () => {
  const lastAppointment = new Date("2026-07-15T08:30:00.000Z");
  assert.equal(
    initialSurveyDueAt(lastAppointment, APPROVED_SCHEDULE).toISOString(),
    "2026-07-16T08:30:00.000Z",
  );
});

test("keeps reminder offsets anchored to the initial survey", () => {
  const delays = scheduleDelays(APPROVED_SCHEDULE);
  assert.equal(delays.reminder1Ms, 3 * 24 * 60 * 60 * 1000);
  assert.equal(delays.reminder2Ms, 7 * 24 * 60 * 60 * 1000);
  assert.equal(delays.finalMs, 14 * 24 * 60 * 60 * 1000);
});

test("normalizes stored schedules back to the approved limits", () => {
  assert.deepEqual(
    normalizeSurveyOutreachSchedule({
      initialDelayHours: 30,
      reminder1Days: 5,
      reminder2Days: 10,
      finalReminderDays: 21,
    }),
    {
      initialDelayHours: 24,
      reminder1Days: 3,
      reminder2Days: 7,
      finalReminderDays: 21,
    },
  );
});

test("rejects schedules outside the approved policy", () => {
  assert.equal(validateSurveyOutreachScheduleInput(APPROVED_SCHEDULE), null);
  assert.match(
    validateSurveyOutreachScheduleInput({ ...APPROVED_SCHEDULE, initialDelayHours: 25 }) ?? "",
    /2-24 hours/,
  );
  assert.match(
    validateSurveyOutreachScheduleInput({ ...APPROVED_SCHEDULE, reminder1Days: 4 }) ?? "",
    /Reminder 1 must be 3 days/,
  );
  assert.match(
    validateSurveyOutreachScheduleInput({ ...APPROVED_SCHEDULE, finalReminderDays: 18 }) ?? "",
    /14 or 21 days/,
  );
});

test("backs off repeated email failures instead of retrying every minute", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  assert.equal(
    surveySendRetryAt({ attempt: 1, now })?.toISOString(),
    "2026-07-15T12:02:00.000Z",
  );
  assert.equal(
    surveySendRetryAt({ attempt: 3, now })?.toISOString(),
    "2026-07-15T12:15:00.000Z",
  );
});

test("honors a longer provider retry-after delay", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  assert.equal(
    surveySendRetryAt({ attempt: 1, now, retryAfterMs: 10 * 60 * 1000 })?.toISOString(),
    "2026-07-15T12:10:00.000Z",
  );
});

test("quarantines a message after the maximum attempt count", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  assert.equal(surveySendRetryAt({ attempt: MAX_SURVEY_SEND_ATTEMPTS, now }), null);
});

test("prevents overdue reminders from being sent back-to-back", () => {
  const planned = new Date("2026-07-15T12:00:00.000Z");
  const previousSent = new Date("2026-07-16T08:00:00.000Z");
  assert.equal(
    noEarlierThanMinimumMessageGap(planned, previousSent).toISOString(),
    "2026-07-17T08:00:00.000Z",
  );
});
