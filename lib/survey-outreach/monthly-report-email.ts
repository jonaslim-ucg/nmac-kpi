export type SurveyMonthlyReportSummary = {
  periodKey: string;
  periodLabel: string;
  dateStart: string;
  dateEnd: string;
  surveysSent: number;
  responses: number;
  responseRate: number | null;
  averages: {
    scheduling: number | null;
    visit: number | null;
    provider: number | null;
    health: number | null;
    recommend: number | null;
    frontDesk: number | null;
  };
  testimonials: number;
  exceptionalStaffResponses: number;
  handling: {
    needsReview: number;
    inProgress: number;
    actioned: number;
    noActionNeeded: number;
  };
  dashboardUrl: string;
};

type MonthlyReportEmail = { subject: string; textBody: string; htmlBody: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function rating(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}/5`;
}

function percent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Manager";
}

function metricCard(label: string, value: string, detail: string): string {
  return [
    '<td width="33.33%" valign="top" style="padding:6px;">',
    '<div style="min-height:92px;border:1px solid #dbe4f0;border-radius:10px;background:#f7f9fc;padding:14px;">',
    `<p style="margin:0 0 7px;color:#64748b;font-size:11px;line-height:1.35;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">${escapeHtml(label)}</p>`,
    `<p style="margin:0;color:#0f172a;font-size:24px;line-height:1.15;font-weight:700;">${escapeHtml(value)}</p>`,
    `<p style="margin:6px 0 0;color:#64748b;font-size:12px;line-height:1.4;">${escapeHtml(detail)}</p>`,
    "</div>",
    "</td>",
  ].join("");
}

export function buildSurveyMonthlyReportEmail(input: {
  recipientName: string;
  summary: SurveyMonthlyReportSummary;
  test?: boolean;
}): MonthlyReportEmail {
  const { summary } = input;
  const subjectPrefix = input.test ? "[TEST] " : "";
  const subject = `${subjectPrefix}NMAC monthly patient survey report — ${summary.periodLabel}`;
  const responseRate = percent(summary.responseRate);
  const safeDashboardUrl = escapeHtml(summary.dashboardUrl);
  const ratingRows = [
    ["Scheduling ease", rating(summary.averages.scheduling)],
    ["Overall visit", rating(summary.averages.visit)],
    ["Provider", rating(summary.averages.provider)],
    ["Health improvement", rating(summary.averages.health)],
    ["Likelihood to recommend", rating(summary.averages.recommend)],
    ["Front desk", rating(summary.averages.frontDesk)],
  ];

  const textBody = [
    `Hi ${firstName(input.recipientName)},`,
    "",
    `Here is the NMAC patient survey report for ${summary.periodLabel}.`,
    `Reporting period: ${summary.dateStart} to ${summary.dateEnd}`,
    "",
    `Initial surveys sent: ${summary.surveysSent}`,
    `Responses received: ${summary.responses}`,
    `Period response rate: ${responseRate}`,
    `Testimonials: ${summary.testimonials}`,
    `Exceptional staff responses: ${summary.exceptionalStaffResponses}`,
    "",
    ...ratingRows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Feedback handling",
    `Needs review: ${summary.handling.needsReview}`,
    `In progress: ${summary.handling.inProgress}`,
    `Actioned: ${summary.handling.actioned}`,
    `No action needed: ${summary.handling.noActionNeeded}`,
    "",
    `Open the staff dashboard: ${summary.dashboardUrl}`,
    "",
    "This report contains summary data only. Open the staff dashboard for review details.",
  ].join("\n");

  const htmlBody = [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:680px;max-width:100%;overflow:hidden;border:1px solid #dbe4f0;border-radius:14px;background:#ffffff;">',
    '<tr><td style="padding:24px 30px;background:#0f2747;color:#ffffff;">',
    '<p style="margin:0 0 5px;color:#7dd3fc;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">NMAC patient experience</p>',
    `<h1 style="margin:0;font-size:25px;line-height:1.25;">Monthly survey report — ${escapeHtml(summary.periodLabel)}</h1>`,
    `<p style="margin:8px 0 0;color:#cbd5e1;font-size:13px;">${escapeHtml(summary.dateStart)} to ${escapeHtml(summary.dateEnd)} · Atlantic/Bermuda</p>`,
    "</td></tr>",
    '<tr><td style="padding:26px 24px 10px;">',
    `<p style="margin:0 6px 18px;font-size:16px;line-height:1.6;">Hi ${escapeHtml(firstName(input.recipientName))}, here is the monthly patient survey summary for NMAC.</p>`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">',
    "<tr>",
    metricCard("Initial surveys sent", String(summary.surveysSent), "Visits attributed to the reporting month"),
    metricCard("Responses", String(summary.responses), "Surveys submitted during the month"),
    metricCard("Response rate", responseRate, "Responses divided by initial surveys sent"),
    "</tr><tr>",
    metricCard("Testimonials", String(summary.testimonials), "Written testimonial responses"),
    metricCard("Exceptional staff", String(summary.exceptionalStaffResponses), "Written staff-recognition responses"),
    metricCard("Needs review", String(summary.handling.needsReview), "Responses awaiting staff handling"),
    "</tr></table>",
    '<h2 style="margin:24px 6px 10px;font-size:17px;">Average ratings</h2>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">',
    ...ratingRows.map(([label, value]) => [
      '<tr>',
      `<td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:14px;">${escapeHtml(label)}</td>`,
      `<td align="right" style="padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:700;">${escapeHtml(value)}</td>`,
      "</tr>",
    ].join("")),
    "</table>",
    '<h2 style="margin:24px 6px 10px;font-size:17px;">Feedback handling</h2>',
    `<p style="margin:0 6px 20px;color:#475569;font-size:14px;line-height:1.7;">Needs review: <strong>${summary.handling.needsReview}</strong> &nbsp;·&nbsp; In progress: <strong>${summary.handling.inProgress}</strong> &nbsp;·&nbsp; Actioned: <strong>${summary.handling.actioned}</strong> &nbsp;·&nbsp; No action needed: <strong>${summary.handling.noActionNeeded}</strong></p>`,
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td bgcolor="#2563eb" style="border-radius:9px;">',
    `<a href="${safeDashboardUrl}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Open survey dashboard</a>`,
    "</td></tr></table>",
    '<p style="margin:20px 6px 4px;color:#64748b;font-size:12px;line-height:1.55;text-align:center;">Summary data only. Patient-level comments and handling notes remain in the staff dashboard.</p>',
    "</td></tr>",
    '<tr><td style="padding:16px 30px;background:#f1f5f9;color:#64748b;font-size:12px;text-align:center;">Northshore Medical &amp; Aesthetics Center</td></tr>',
    "</table></td></tr></table></body></html>",
  ].join("");

  return { subject, textBody, htmlBody };
}
