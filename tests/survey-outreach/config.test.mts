import assert from "node:assert/strict";
import test from "node:test";
import { isProductionSurveyOutreachInActiveCohort } from "../../lib/survey-outreach/config.ts";

const LIVE_START = "2026-07-27T11:17:48.280Z";

test("keeps an already-started survey chain active after the app switch resumes", () => {
  assert.equal(
    isProductionSurveyOutreachInActiveCohort({
      appointmentAt: "2026-07-23T15:00:00.000Z",
      createdAt: "2026-07-24T15:00:00.000Z",
      initialSentAt: "2026-07-24T15:01:00.000Z",
      liveStartAt: LIVE_START,
    }),
    true,
  );
});

test("does not admit an unsent checkout from before the latest enable cutoff", () => {
  assert.equal(
    isProductionSurveyOutreachInActiveCohort({
      appointmentAt: "2026-07-23T15:00:00.000Z",
      createdAt: "2026-07-24T15:00:00.000Z",
      initialSentAt: null,
      liveStartAt: LIVE_START,
    }),
    false,
  );
});

test("admits a new unsent checkout only when appointment and row are after the cutoff", () => {
  assert.equal(
    isProductionSurveyOutreachInActiveCohort({
      appointmentAt: "2026-07-28T15:00:00.000Z",
      createdAt: "2026-07-28T15:01:00.000Z",
      initialSentAt: null,
      liveStartAt: LIVE_START,
    }),
    true,
  );
  assert.equal(
    isProductionSurveyOutreachInActiveCohort({
      appointmentAt: "2026-07-28T15:00:00.000Z",
      createdAt: "2026-07-26T15:01:00.000Z",
      initialSentAt: null,
      liveStartAt: LIVE_START,
    }),
    false,
  );
});

test("does not treat an invalid initial timestamp as proof that a chain started", () => {
  assert.equal(
    isProductionSurveyOutreachInActiveCohort({
      appointmentAt: "2026-07-23T15:00:00.000Z",
      initialSentAt: "invalid",
      liveStartAt: LIVE_START,
    }),
    false,
  );
});
