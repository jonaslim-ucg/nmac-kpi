import type { SurveyOutreachStage } from "@/lib/survey-outreach/types";
import { buildSurveyUrl } from "@/lib/survey-outreach/urls";

type EmailContent = { subject: string; textBody: string; htmlBody: string };

function greeting(name: string): string {
  const first = name.trim().split(/[\s,]+/)[0] || "there";
  return `Hello ${first},`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;">${escapeHtml(text)}</p>`;
}

const raffleNote =
  "Quarterly gift voucher draw: Complete this testimonial survey and you will automatically be entered into our quarterly draw for a chance to win one of two $100 gift vouchers.";

function buildHtmlBody(input: {
  patientName: string;
  intro: string[];
  link: string;
}): string {
  const safeLink = escapeHtml(input.link);
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;">',
    paragraph(greeting(input.patientName)),
    ...input.intro.map(paragraph),
    '<div style="margin:18px 0;padding:14px 16px;border-left:4px solid #d97706;background:#fff7ed;color:#7c2d12;">',
    '<p style="margin:0 0 4px;font-weight:700;">Quarterly gift voucher draw</p>',
    '<p style="margin:0;">Complete this testimonial survey and you will automatically be entered into our quarterly draw for a chance to win one of two $100 gift vouchers.</p>',
    "</div>",
    `<p style="margin:0 0 18px;"><a href="${safeLink}" style="font-weight:700;color:#2563eb;">Complete the survey</a></p>`,
    paragraph("Thank you,"),
    '<p style="margin:0 0 18px;">Northshore Medical &amp; Aesthetics Center</p>',
    '<p style="margin:0;color:#6b7280;font-size:13px;">If you already completed this survey, you can ignore this email.</p>',
    "</div>",
  ].join("");
}

function buildContent(input: {
  subject: string;
  patientName: string;
  intro: string[];
  link: string;
}): EmailContent {
  const textBody = [
    greeting(input.patientName),
    "",
    ...input.intro.flatMap((line) => [line, ""]),
    raffleNote,
    "",
    `Complete the survey: ${input.link}`,
    "",
    "Thank you,",
    "Northshore Medical & Aesthetics Center",
    "",
    "If you already completed this survey, you can ignore this email.",
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
        subject: hasMultipleAppointments
          ? "How were your recent visits to NMAC?"
          : "How was your recent visit to NMAC?",
        patientName,
        link,
        intro: [
          hasMultipleAppointments
            ? "Thank you for visiting Northshore Medical & Aesthetics Center. We hope your appointments went well."
            : "Thank you for visiting Northshore Medical & Aesthetics Center. We hope your appointment went well.",
          hasMultipleAppointments
            ? "Please take a few minutes to share feedback about your experience. You can select all the providers you saw that day."
            : "Please take a few minutes to share feedback about your experience. Your responses help us improve care and service for all patients.",
        ],
      });
    case "reminder1":
      return buildContent({
        subject: "Reminder: Share your NMAC visit feedback",
        patientName,
        link,
        intro: [
          hasMultipleAppointments
            ? "We recently invited you to complete a short survey about your visits to NMAC. We have not received your response yet."
            : "We recently invited you to complete a short survey about your visit to NMAC. We have not received your response yet.",
          "It only takes a few minutes and your feedback makes a real difference.",
        ],
      });
    case "reminder2":
      return buildContent({
        subject: "Second reminder: NMAC provider experience survey",
        patientName,
        link,
        intro: [
          hasMultipleAppointments
            ? "This is a friendly reminder to share your feedback about your recent visits to NMAC."
            : "This is a friendly reminder to share your feedback about your recent visit to NMAC.",
        ],
      });
    case "final":
      return buildContent({
        subject: "Final reminder: NMAC visit survey",
        patientName,
        link,
        intro: [
          hasMultipleAppointments
            ? "This is our final reminder to complete the brief survey about your recent visits to NMAC."
            : "This is our final reminder to complete the brief survey about your recent visit to NMAC.",
        ],
      });
  }
}
