import assert from "node:assert/strict";
import test from "node:test";
import { buildSurveyEmail } from "../../lib/survey-outreach/emails.ts";
import { surveyBaseUrl } from "../../lib/survey-outreach/urls.ts";

test("builds an initial survey email from a CRM-formatted name", () => {
  const email = buildSurveyEmail("initial", "Flood, Amani", "survey-token");

  assert.equal(
    email.subject,
    "How was your recent visit to NMAC?",
  );
  assert.match(email.textBody, /^Hi Amani,/);
  assert.match(email.textBody, /Click below to start the survey\./);
  assert.match(email.htmlBody, />Hi Amani,</);
  assert.match(email.htmlBody, />Click below to start the survey\.</);
  assert.match(email.htmlBody, />Complete My Survey</);
  assert.match(email.htmlBody, /Replies to this email are not recorded as survey responses\./);
  assert.match(email.htmlBody, /tel:\+14412935476/);
  assert.match(email.htmlBody, /\(441\) 293-5476/);
  assert.doesNotMatch(email.htmlBody, /293-0751/);
  assert.match(email.textBody, /Call \(441\) 293-5476/);
  assert.match(email.htmlBody, /https:\/\/kpi\.nmac\.bm\/nmac-email-logo\.png/);
  assert.doesNotMatch(email.htmlBody, /header-full\.png/);
  assert.match(
    email.htmlBody,
    /https:\/\/kpi\.nmac\.bm\/appointment-review\?t=survey-token/,
  );
});

test("keeps the original subject and provider guidance for same-day appointments", () => {
  const email = buildSurveyEmail("initial", "Amani Flood", "survey-token", 2);

  assert.equal(
    email.subject,
    "How was your recent visit to NMAC?",
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

test("uses the branded survey domain instead of a Vercel deployment URL", () => {
  const previousVercelUrl = process.env.VERCEL_URL;
  process.env.VERCEL_URL = "nmac-example-deployment.vercel.app";
  try {
    assert.equal(surveyBaseUrl(), "https://kpi.nmac.bm");
  } finally {
    if (previousVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = previousVercelUrl;
  }
});
