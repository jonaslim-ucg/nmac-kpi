import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SURVEY_MONTHLY_REPORT_CONFIG,
  normalizeSurveyMonthlyReportConfig,
  surveyMonthlyReportPeriod,
  validateSurveyMonthlyReportConfig,
} from "../../lib/survey-outreach/monthly-report-config.ts";
import { buildSurveyMonthlyReportEmail } from "../../lib/survey-outreach/monthly-report-email.ts";

test("monthly report defaults include the requested NMAC manager roster", () => {
  assert.deepEqual(
    DEFAULT_SURVEY_MONTHLY_REPORT_CONFIG.recipients.map((recipient) => recipient.name),
    [
      "Sarah Wilkerson",
      "Dwayne Simpson",
      "Vonettea Rowe",
      "Kennette Burgess",
      "Claudette Govender",
      "Simon Coombes",
      "Tonya MacPhee",
    ],
  );
});

test("disabled report settings allow manager emails to be completed later", () => {
  assert.equal(validateSurveyMonthlyReportConfig(DEFAULT_SURVEY_MONTHLY_REPORT_CONFIG), null);
  assert.match(
    validateSurveyMonthlyReportConfig({
      ...DEFAULT_SURVEY_MONTHLY_REPORT_CONFIG,
      enabled: true,
    }) ?? "",
    /valid email for Sarah Wilkerson/i,
  );
});

test("normalization trims manager details and lowercases emails", () => {
  const config = normalizeSurveyMonthlyReportConfig({
    enabled: true,
    dayOfMonth: 8,
    sendTime: "09:30",
    recipients: [{
      id: " Manager One ",
      name: " Manager One ",
      title: " Practice Manager ",
      department: " NMAC ",
      email: " MANAGER@UCG.BM ",
      enabled: true,
    }],
  });
  assert.equal(config.recipients[0]?.email, "manager@ucg.bm");
  assert.equal(config.recipients[0]?.name, "Manager One");
  assert.equal(validateSurveyMonthlyReportConfig(config), null);
});

test("monthly schedule sends the previous calendar month in Bermuda", () => {
  const config = {
    ...DEFAULT_SURVEY_MONTHLY_REPORT_CONFIG,
    dayOfMonth: 1,
    sendTime: "08:00",
  };
  const before = surveyMonthlyReportPeriod(config, new Date("2026-08-01T10:59:00.000Z"));
  const due = surveyMonthlyReportPeriod(config, new Date("2026-08-01T11:00:00.000Z"));
  assert.equal(due.periodKey, "2026-07");
  assert.equal(due.dateStart, "2026-07-01");
  assert.equal(due.dateEnd, "2026-07-31");
  assert.equal(due.scheduledAt, "2026-08-01T11:00:00.000Z");
  assert.equal(before.due, false);
  assert.equal(due.due, true);
});

test("monthly report email contains summary metrics and dashboard link", () => {
  const email = buildSurveyMonthlyReportEmail({
    recipientName: "Vonettea Rowe",
    test: true,
    summary: {
      periodKey: "2026-07",
      periodLabel: "July 2026",
      dateStart: "2026-07-01",
      dateEnd: "2026-07-31",
      surveysSent: 120,
      responses: 30,
      responseRate: 25,
      averages: {
        scheduling: 4.5,
        visit: 4.6,
        provider: 4.7,
        health: 4.1,
        recommend: 4.6,
        frontDesk: 4.6,
      },
      testimonials: 12,
      exceptionalStaffResponses: 10,
      handling: { needsReview: 5, inProgress: 2, actioned: 20, noActionNeeded: 3 },
      dashboardUrl: "https://kpi.nmac.bm/admin/appointment-reviews",
    },
  });
  assert.match(email.subject, /^\[TEST\].*July 2026/);
  assert.match(email.textBody, /Initial surveys sent: 120/);
  assert.match(email.textBody, /Period response rate: 25\.0%/);
  assert.match(email.htmlBody, /Open survey dashboard/);
  assert.doesNotMatch(email.htmlBody, /patient_name|feedback_notes/i);
});
