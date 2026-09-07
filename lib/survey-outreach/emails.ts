import type { SurveyOutreachStage } from "./types.ts";
import { buildSurveyUrl, surveyBaseUrl } from "./urls.ts";

type EmailContent = { subject: string; textBody: string; htmlBody: string };

const EMAIL_ASSET_BASE =
  "https://olonjbczxsytseikrajo.supabase.co/storage/v1/object/public/email-assets";
const EMAIL_LOGO_URL = "https://kpi.nmac.bm/nmac-email-logo.png";
const PRACTICE_NAME = "Northshore Medical Center";
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
  const firstName = patientFirstName(name);
  return firstName === "there" ? "How did we do?" : `How did we do, ${firstName}?`;
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
  const firstName = patientFirstName(input.patientName);
  const hasPatientName = firstName !== "there";
  const safeFirstName = escapeHtml(firstName);
  const publicAssetBase = escapeHtml(surveyBaseUrl());

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
    ".hero-table{height:170px!important;}",
    ".hero-copy{padding:24px!important;}",
    ".full-img{max-width:100%!important;height:auto!important;}",
    ".benefit-icon-cell{padding:12px 4px 0!important;}",
    ".benefit-heading-cell{padding:0 4px!important;}",
    ".benefit-copy-cell{padding:3px 4px 12px!important;}",
    ".benefit-icon{width:54px!important;height:54px!important;}",
    ".raffle-image-cell{width:118px!important;padding:12px 4px 12px 10px!important;}",
    ".raffle-image{width:108px!important;height:auto!important;}",
    ".raffle-copy-cell{padding:14px 12px 14px 8px!important;}",
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
    '<tr><td style="padding:0;height:2px;line-height:2px;font-size:1px;background-color:#cfe8bf;">&nbsp;</td></tr>',
    "<tr>",
    `<td background="${publicAssetBase}/survey-hero-clinic.jpg" valign="middle" style="background-color:#e8f5f6;background-image:url('${publicAssetBase}/survey-hero-clinic.jpg');background-position:center center;background-repeat:no-repeat;background-size:cover;">`,
    '<!--[if gte mso 9]>',
    '<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:640px;height:196px;">',
    `<v:fill type="frame" src="${publicAssetBase}/survey-hero-clinic.jpg" color="#e8f5f6" />`,
    '<v:textbox inset="0,0,0,0">',
    '<![endif]-->',
    '<table role="presentation" class="hero-table" width="100%" height="196" cellspacing="0" cellpadding="0" border="0" style="width:100%;height:196px;">',
    "<tr>",
    `<td class="hero-copy" background="${publicAssetBase}/survey-hero-copy-mask.png" width="60%" valign="middle" style="width:60%;padding:28px 42px;background-image:url('${publicAssetBase}/survey-hero-copy-mask.png');background-position:center center;background-repeat:no-repeat;background-size:100% 100%;">`,
    `<p style="margin:0 0 14px;line-height:1.15;color:#071733;font-weight:700;"><span style="font-size:25px;">How did we do${hasPatientName ? "," : "?"}</span>${hasPatientName ? `<br><span style="color:#08757d;font-family:Georgia,Times New Roman,serif;font-size:38px;font-style:italic;font-weight:400;">${safeFirstName}?</span>` : ""}</p>`,
    '<p style="margin:0;color:#071733;font-size:16px;line-height:1.4;font-weight:700;">Your experience matters to us.</p>',
    "</td>",
    '<td width="40%" style="width:40%;font-size:1px;line-height:1px;">&nbsp;</td>',
    "</tr>",
    "</table>",
    '<!--[if gte mso 9]>',
    "</v:textbox>",
    "</v:rect>",
    '<![endif]-->',
    "</td>",
    "</tr>",
    "<tr>",
    '<td class="content-wrap" style="padding:28px 42px 28px;border-top:4px solid #29a9df;">',
    '<p style="margin:0 0 7px;color:#168dbd;font-size:12px;line-height:1.3;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Patient Experience Survey</p>',
    `<h1 class="survey-title" style="margin:0 0 18px;color:#071733;font-size:34px;line-height:1.18;font-weight:700;text-align:left;font-family:Arial,Helvetica,sans-serif;">${safeHeading}</h1>`,
    ...input.intro.map(introParagraph),
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:22px 0;border:1px solid #a8d7da;border-left:5px solid #69b63f;border-radius:12px;background-color:#eaf8f7;overflow:hidden;">',
    '<tr>',
    '<td class="raffle-image-cell" width="150" valign="middle" align="center" bgcolor="#dff3f2" style="width:150px;padding:12px 6px 12px 12px;background-color:#dff3f2;text-align:center;line-height:0;font-size:0;">',
    `<img class="raffle-image" src="${publicAssetBase}/survey-gift-voucher-cutout-v2.png" width="138" height="107" alt="$100 gift voucher" style="display:block;width:138px;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;">`,
    '</td>',
    '<td class="raffle-copy-cell" valign="middle" style="padding:17px 18px 17px 12px;color:#174a63;">',
    '<p style="margin:0 0 5px;color:#08757d;font-size:17px;line-height:1.3;font-weight:700;">Complete the survey. Enter the quarterly draw.</p>',
    '<p style="margin:0 0 5px;color:#477f2c;font-size:15px;line-height:1.35;font-weight:700;">One of two $100 gift vouchers</p>',
    `<p style="margin:0;color:#174a63;font-size:14px;line-height:1.5;">${RAFFLE_COPY}</p>`,
    '</td>',
    '</tr>',
    '</table>',
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:22px auto 14px;">',
    "<tr>",
    '<td align="center" bgcolor="#08757d" style="border-radius:10px;box-shadow:0 4px 10px rgba(8,117,125,0.24);">',
    `<a class="survey-button" href="${safeLink}" aria-label="Share my feedback in the survey" style="display:inline-block;padding:14px 20px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.2;font-weight:700;text-decoration:none;border-radius:10px;white-space:nowrap;"><span style="display:inline-block;min-width:190px;text-align:center;">Share My Feedback</span><span aria-hidden="true" style="display:inline-block;width:28px;margin-left:16px;color:#b7e594;font-size:27px;line-height:20px;text-align:right;vertical-align:-2px;">&#8594;</span></a>`,
    "</td>",
    "</tr>",
    "</table>",
    '<p style="margin:0 0 22px;font-size:13px;line-height:1.55;color:#4b6475;text-align:center;"><span aria-hidden="true" style="color:#168dbd;font-size:17px;font-weight:700;vertical-align:-1px;">&#8599;</span>&nbsp; Opens securely in your browser&nbsp;&nbsp;&middot;&nbsp;&nbsp;<span aria-hidden="true" style="color:#69b63f;font-size:17px;font-weight:700;vertical-align:-1px;">&#9719;</span>&nbsp; Takes only a few minutes</p>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3fafd" style="width:100%;table-layout:fixed;margin:0 0 22px;border-top:1px solid #b9dceb;border-bottom:1px solid #b9dceb;background-color:#f3fafd;">',
    "<tr>",
    `<td class="benefit-icon-cell" width="33.333%" height="88" valign="middle" align="center" style="width:33.333%;height:88px;padding:16px 6px 0;text-align:center;"><img class="benefit-icon" src="${publicAssetBase}/survey-better-care-v2.png" width="66" height="66" alt="" style="display:block;width:66px;height:66px;margin:0 auto;border:0;outline:none;text-decoration:none;"></td>`,
    `<td class="benefit-icon-cell" width="33.333%" height="88" valign="middle" align="center" style="width:33.333%;height:88px;padding:16px 6px 0;text-align:center;border-left:1px solid #c7dde0;"><img class="benefit-icon" src="${publicAssetBase}/survey-better-service-v2.png" width="66" height="66" alt="" style="display:block;width:66px;height:66px;margin:0 auto;border:0;outline:none;text-decoration:none;"></td>`,
    `<td class="benefit-icon-cell" width="33.333%" height="88" valign="middle" align="center" style="width:33.333%;height:88px;padding:16px 6px 0;text-align:center;border-left:1px solid #c7dde0;"><img class="benefit-icon" src="${publicAssetBase}/survey-better-experience-v2.png" width="66" height="66" alt="" style="display:block;width:66px;height:66px;margin:0 auto;border:0;outline:none;text-decoration:none;"></td>`,
    "</tr>",
    "<tr>",
    '<td class="benefit-heading-cell" width="33.333%" height="26" valign="middle" align="center" style="width:33.333%;height:26px;padding:0 6px;text-align:center;"><p style="margin:0;color:#08757d;font-size:15px;line-height:1.3;font-weight:700;">Better Care</p></td>',
    '<td class="benefit-heading-cell" width="33.333%" height="26" valign="middle" align="center" style="width:33.333%;height:26px;padding:0 6px;text-align:center;border-left:1px solid #c7dde0;"><p style="margin:0;color:#08757d;font-size:15px;line-height:1.3;font-weight:700;">Better Service</p></td>',
    '<td class="benefit-heading-cell" width="33.333%" height="26" valign="middle" align="center" style="width:33.333%;height:26px;padding:0 6px;text-align:center;border-left:1px solid #c7dde0;"><p style="margin:0;color:#08757d;font-size:15px;line-height:1.3;font-weight:700;">Better Experience</p></td>',
    "</tr>",
    "<tr>",
    '<td class="benefit-copy-cell" width="33.333%" height="48" valign="top" align="center" style="width:33.333%;height:48px;padding:3px 6px 18px;text-align:center;"><p style="margin:0;color:#071733;font-size:12px;line-height:1.4;">Help us improve<br>clinical care</p></td>',
    '<td class="benefit-copy-cell" width="33.333%" height="48" valign="top" align="center" style="width:33.333%;height:48px;padding:3px 6px 18px;text-align:center;border-left:1px solid #c7dde0;"><p style="margin:0;color:#071733;font-size:12px;line-height:1.4;">Help our team<br>serve you better</p></td>',
    '<td class="benefit-copy-cell" width="33.333%" height="48" valign="top" align="center" style="width:33.333%;height:48px;padding:3px 6px 18px;text-align:center;border-left:1px solid #c7dde0;"><p style="margin:0;color:#071733;font-size:12px;line-height:1.4;">Help shape the<br>NMAC experience</p></td>',
    "</tr>",
    "</table>",
    '<p style="margin:0 0 22px;color:#4b6475;font-size:14px;line-height:1.55;text-align:center;">Your feedback helps us continuously improve every patient&rsquo;s experience.</p>',
    '<div style="margin:0 0 22px;padding:13px 16px;border:1px solid #b9dceb;border-left:4px solid #08757d;border-radius:8px;background-color:#eaf5fb;color:#174a63;text-align:center;">',
    '<p style="margin:0;font-size:14px;line-height:1.55;font-weight:700;">Replies to this email are not recorded as survey responses.</p>',
    "</div>",
    `<p style="margin:0 0 24px;font-size:13px;line-height:1.55;color:#4b6475;">If the button does not open, copy and paste this link into your browser:<br><a href="${safeLink}" style="color:#168dbd;text-decoration:underline;word-break:break-all;">${safeLink}</a></p>`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3faf0" style="margin:0;border:1px solid #cbe5bc;border-radius:8px;background-color:#f3faf0;overflow:hidden;">',
    "<tr>",
    '<td style="padding:16px 18px;">',
    '<p style="margin:0 0 6px;color:#08757d;font-size:16px;line-height:1.35;font-weight:700;"><span aria-hidden="true" style="color:#69b63f;font-size:19px;vertical-align:-1px;">&#9742;</span>&nbsp; Need help opening the survey?</p>',
    '<p style="margin:0;font-size:14px;line-height:1.6;color:#071733;">Call <a href="tel:+14412935476" style="color:#168dbd;text-decoration:underline;">(441) 293-5476</a> or WhatsApp <a href="https://wa.me/14419020751" style="color:#168dbd;text-decoration:underline;">+1 (441) 902-0751</a>.</p>',
    "</td>",
    "</tr>",
    "</table>",
    '<p style="margin:22px 0 0;color:#6b7280;font-size:13px;line-height:1.55;">If you have already completed this survey, no further action is needed.</p>',
    "</td>",
    "</tr>",
    "<tr>",
    '<td align="center" style="padding:18px 42px;border-top:3px solid #69b63f;background-color:#e8f5f6;">',
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
    '<tr>',
    `<td align="center" style="padding:7px 24px;background-color:#08757d;color:#ffffff;font-size:14px;line-height:1.3;text-align:center;">${safePracticeName}</td>`,
    "</tr>",
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
    "Open your survey using the link below.",
    "Replies to this email are not recorded as survey responses.",
    "",
    `Share My Feedback: ${input.link}`,
    "",
    "Your feedback helps improve:",
    "- Better Care: Help us improve clinical care.",
    "- Better Service: Help our team serve you better.",
    "- Better Experience: Help shape the NMAC experience.",
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
