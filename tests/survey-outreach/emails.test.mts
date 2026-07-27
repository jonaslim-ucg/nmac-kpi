import assert from "node:assert/strict";
import test from "node:test";
import { buildSurveyEmail } from "../../lib/survey-outreach/emails.ts";

test("builds an action-oriented initial survey email from a CRM-formatted name", () => {
  const email = buildSurveyEmail("initial", "Flood, Amani", "survey-token");

  assert.equal(
    email.subject,
    "Survey answers needed: How was your recent visit to NMAC?",
  );
  assert.match(email.textBody, /^Hi Amani,/);
  assert.match(email.htmlBody, />Hi Amani,</);
  assert.match(email.htmlBody, />Complete My Survey</);
  assert.match(email.htmlBody, /Replies to this email are not recorded as survey responses\./);
  assert.match(email.htmlBody, /header-full\.png/);
  assert.match(
    email.htmlBody,
    /https:\/\/kpi\.nmac\.bm\/appointment-review\?t=survey-token/,
  );
});

test("uses the plural subject and provider guidance for same-day appointments", () => {
  const email = buildSurveyEmail("initial", "Amani Flood", "survey-token", 2);

  assert.equal(
    email.subject,
    "Survey answers needed: How were your recent visits to NMAC?",
  );
  assert.match(email.textBody, /select all the providers you saw that day/);
});

test("keeps the action-needed prefix on reminder subjects", () => {
  assert.equal(
    buildSurveyEmail("reminder1", "Amani Flood", "token").subject,
    "Survey answers needed: Reminder about your NMAC visit",
  );
  assert.equal(
    buildSurveyEmail("final", "Dr. Amani Flood", "token").subject,
    "Survey answers needed: Final reminder about your NMAC visit",
  );
  assert.match(
    buildSurveyEmail("final", "Dr. Amani Flood", "token").textBody,
    /^Hi Amani,/,
  );
});
