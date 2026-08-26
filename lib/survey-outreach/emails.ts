import type { SurveyOutreachStage } from "./types.ts";
import { buildSurveyUrl } from "./urls.ts";

type EmailContent = { subject: string; textBody: string; htmlBody: string };

const EMAIL_ASSET_BASE =
  "https://olonjbczxsytseikrajo.supabase.co/storage/v1/object/public/email-assets";
const EMAIL_LOGO_URL = "https://kpi.nmac.bm/nmac-email-logo.png";
const PRACTICE_NAME = "Northshore Medical & Aesthetics Center";
const RAFFLE_COPY =
  "Complete this testimonial survey and you will automatically be entered into our quarterly draw for a chance to win one of two $100 gift vouchers.";

function patientFirstName(name: string): string {
  const clean = name.trim();
  if (!clean) return "there";

  const commaParts = clean.split(",");
  const firstNameSide = commaParts.length > 1
    ? commaParts.slice(1).join(" ").trim() || commaParts[0].trim()
    : clean;
  const parts = firstNameSide.split(/\s+/).filter(Boolean);
  const titles = new Set(["mr", "mrs", "ms", "miss", "dr", "prof"]);
  while (parts.length > 1 && titles.has(parts[0].toLowerCase().replaceAll(".", ""))) {
    parts.shift();
  }
  return parts[0] || "there";
}

function greeting(name: string): string {
  return `Hi ${patientFirstName(name)},`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function introParagraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#071733;font-weight:400;">${escapeHtml(text)}</p>`;
}

function buildHtmlBody(input: {
  subject: string;
  patientName: string;
  heading: string;
  intro: string[];
  link: string;
}): string {
  const safeLink = escapeHtml(input.link);
  const safeSubject = escapeHtml(input.subject);
  const safeHeading = escapeHtml(input.heading);
  const safePracticeName = escapeHtml(PRACTICE_NAME);

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="x-apple-disable-message-reformatting">',
    `<title>${safeSubject}</title>`,
    "<style>",
    "@media only screen and (max-width:680px){",
    ".email-shell{width:100%!important;}",
    ".content-wrap{padding-left:24px!important;padding-right:24px!important;}",
    ".survey-title{font-size:28px!important;}",
    ".survey-button{display:block!important;padding-left:20px!important;padding-right:20px!important;}",
    ".full-img{max-width:100%!important;height:auto!important;}",
    ".footer-icon-cell,.footer-copy-cell{display:block!important;width:100%!important;text-align:center!important;}",
    ".footer-icon-cell{padding:0 0 10px!important;}",
    "}",
    "</style>",
    "</head>",
    '<body style="margin:0;padding:0;background-color:#eef6f7;color:#071733;font-family:Arial,Helvetica,sans-serif;">',
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">',
    "Please use the survey button to submit your answers. Email replies are not recorded as survey responses.",
    "</div>",
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background-color:#eef6f7;">',
    "<tr>",
    '<td align="center" style="padding:24px 12px;">',
    '<table role="presentation" class="email-shell" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:640px;background-color:#ffffff;border:1px solid #d7e3e6;border-radius:8px;overflow:hidden;">',
    "<tr>",
    '<td align="center" style="padding:20px 26px 16px;line-height:0;font-size:0;text-align:center;background-color:#ffffff;">',
    `<img src="${EMAIL_LOGO_URL}" width="460" height="166" alt="${safePracticeName}" style="display:block;width:460px;max-width:100%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;">`,
    "</td>",
    "</tr>",
    '<tr><td style="padding:0;height:1px;line-height:1px;font-size:1px;background-color:#d9e5e8;">&nbsp;</td></tr>',
    "<tr>",
    '<td class="content-wrap" style="padding:32px 42px 28px;">',
    `<p style="margin:0 0 18px;font-size:18px;line-height:1.4;color:#071733;font-weight:700;">${escapeHtml(greeting(input.patientName))}</p>`,
    `<h1 class="survey-title" style="margin:0 0 18px;color:#071733;font-size:34px;line-height:1.18;font-weight:700;text-align:left;font-family:Arial,Helvetica,sans-serif;">${safeHeading}</h1>`,
    ...input.intro.map(introParagraph),
    '<div style="margin:22px 0;padding:16px 18px;border:1px solid #f2c98d;border-left:5px solid #d97706;border-radius:8px;background-color:#fff7ed;color:#7c2d12;">',
    '<p style="margin:0 0 5px;font-size:16px;line-height:1.4;font-weight:700;">Complete the survey. Enter the quarterly draw.</p>',
    `<p style="margin:0;font-size:15px;line-height:1.55;">${RAFFLE_COPY}</p>`,
    "</div>",
    '<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#071733;font-weight:700;text-align:center;">Click below to start the survey.</p>',
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 14px;">',
    "<tr>",
    '<td align="center" bgcolor="#08757d" style="border-radius:10px;box-shadow:0 4px 10px rgba(8,117,125,0.24);">',
    `<a class="survey-button" href="${safeLink}" style="display:inline-block;padding:16px 34px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.2;font-weight:700;text-decoration:none;border-radius:10px;">Complete My Survey</a>`,
    "</td>",
    "</tr>",
    "</table>",
    '<p style="margin:0 0 22px;font-size:13px;line-height:1.55;color:#4b6475;text-align:center;">Takes only a few minutes. Please use the button above to submit your answers.</p>',
    '<div style="margin:0 0 22px;padding:13px 16px;border-radius:8px;background-color:#e8f5f6;color:#07545a;text-align:center;">',
    '<p style="margin:0;font-size:14px;line-height:1.55;font-weight:700;">Replies to this email are not recorded as survey responses.</p>',
    "</div>",
    `<p style="margin:0 0 24px;font-size:13px;line-height:1.55;color:#4b6475;">If the button does not open, copy and paste this link into your browser:<br><a href="${safeLink}" style="color:#08757d;text-decoration:underline;word-break:break-all;">${safeLink}</a></p>`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;border-top:1px solid #d9e5e8;">',
    "<tr>",
    '<td style="padding:20px 0 0;">',
    '<p style="margin:0 0 6px;color:#08757d;font-size:16px;line-height:1.35;font-weight:700;">Need help opening the survey?</p>',
    '<p style="margin:0;font-size:14px;line-height:1.6;color:#071733;">Call <a href="tel:+14412935476" style="color:#174a63;text-decoration:underline;">(441) 293-5476</a> or WhatsApp <a href="https://wa.me/14419020751" style="color:#174a63;text-decoration:underline;">+1 (441) 902-0751</a>.</p>',
    "</td>",
    "</tr>",
    "</table>",
    '<p style="margin:22px 0 0;color:#6b7280;font-size:13px;line-height:1.55;">If you have already completed this survey, no further action is needed.</p>',
    "</td>",
    "</tr>",
    "<tr>",
    '<td align="center" style="padding:18px 42px;background-color:#e8f5f6;">',
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">',
    "<tr>",
    '<td class="footer-icon-cell" valign="middle" style="padding:0 18px 0 0;text-align:center;line-height:0;font-size:0;">',
    `<img src="${EMAIL_ASSET_BASE}/heart-care-icon.png" width="48" height="36" alt="" style="display:block;width:48px;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;">`,
    "</td>",
    '<td class="footer-copy-cell" valign="middle" style="color:#08757d;font-size:16px;line-height:1.45;font-weight:700;text-align:left;">',
    "Thank you for trusting us with your care.<br>Your feedback helps us serve you better.",
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    '<tr><td style="padding:0;line-height:0;font-size:0;">',
    `<img class="full-img" src="${EMAIL_ASSET_BASE}/footer-teal-bar.png" width="640" height="32" alt="${safePracticeName}" style="display:block;width:640px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">`,
    "</td></tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("");
}

function buildContent(input: {
  subject: string;
  patientName: string;
  heading: string;
  intro: string[];
  link: string;
}): EmailContent {
  const textBody = [
    greeting(input.patientName),
    "",
    input.heading,
    "",
    ...input.intro.flatMap((line) => [line, ""]),
    "Click below to start the survey.",
    "Replies to this email are not recorded as survey responses.",
    "",
    `Complete My Survey: ${input.link}`,
    "",
    "Quarterly gift voucher draw",
    RAFFLE_COPY,
    "",
    "Need help opening the survey? Call (441) 293-5476 or WhatsApp +1 (441) 902-0751.",
    "",
    "Thank you for trusting us with your care.",
    PRACTICE_NAME,
    "",
    "If you have already completed this survey, no further action is needed.",
  ].join("\n");

  return {
    subject: input.subject,
    textBody,
    htmlBody: buildHtmlBody(input),
  };
}

export function buildSurveyEmail(
  stage: SurveyOutreachStage,
  patientName: string,
  surveyToken: string,
  appointmentCount = 1,
): EmailContent {
  const link = buildSurveyUrl(surveyToken);
  const hasMultipleAppointments = appointmentCount > 1;

  switch (stage) {
    case "initial":
      return buildContent({
        subject: "How was your recent visit to NMAC?",
        patientName,
        link,
        heading: hasMultipleAppointments
          ? "How were your recent visits?"
          : "How was your recent visit?",
        intro: [
          hasMultipleAppointments
            ? `Thank you for visiting ${PRACTICE_NAME}. We hope your appointments went well.`
            : `Thank you for visiting ${PRACTICE_NAME}. We hope your appointment went well.`,
          hasMultipleAppointments
            ? "Please take a few minutes to share feedback about your experience. You can select all the providers you saw that day."
            : "Please take a few minutes to share feedback about your experience. Your responses help us improve care and service for all patients.",
        ],
      });
    case "reminder1":
      return buildContent({
        subject: "Survey answers needed: Reminder about your NMAC visit",
        patientName,
        link,
        heading: "We would still value your feedback",
        intro: [
          hasMultipleAppointments
            ? "We recently invited you to complete a short survey about your visits to NMAC. We have not received your response yet."
            : "We recently invited you to complete a short survey about your visit to NMAC. We have not received your response yet.",
          "It only takes a few minutes and your feedback makes a real difference.",
        ],
      });
    case "reminder2":
      return buildContent({
        subject: "Survey answers needed: Second reminder about your NMAC visit",
        patientName,
        link,
        heading: "Your feedback is still needed",
        intro: [
          hasMultipleAppointments
            ? "This is a friendly reminder to share your feedback about your recent visits to NMAC."
            : "This is a friendly reminder to share your feedback about your recent visit to NMAC.",
        ],
      });
    case "final":
      return buildContent({
        subject: "Survey answers needed: Final reminder about your NMAC visit",
        patientName,
        link,
        heading: "Final reminder to share your feedback",
        intro: [
          hasMultipleAppointments
            ? "This is our final reminder to complete the brief survey about your recent visits to NMAC."
            : "This is our final reminder to complete the brief survey about your recent visit to NMAC.",
        ],
      });
  }
}
