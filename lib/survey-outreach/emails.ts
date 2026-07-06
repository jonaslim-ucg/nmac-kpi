import type { SurveyOutreachStage } from "@/lib/survey-outreach/types";
import { buildSurveyUrl } from "@/lib/survey-outreach/urls";

type EmailContent = { subject: string; textBody: string };

function greeting(name: string): string {
  const first = name.trim().split(/[\s,]+/)[0] || "there";
  return `Hello ${first},`;
}

export function buildSurveyEmail(
  stage: SurveyOutreachStage,
  patientName: string,
  surveyToken: string,
): EmailContent {
  const link = buildSurveyUrl(surveyToken);
  const signOff =
    "Thank you,\nNorthshore Medical & Aesthetics Center\n\n—\nIf you already completed this survey, you can ignore this email.";

  switch (stage) {
    case "initial":
      return {
        subject: "How was your recent visit to NMAC?",
        textBody: [
          greeting(patientName),
          "",
          "Thank you for visiting Northshore Medical & Aesthetics Center. We hope your appointment went well.",
          "",
          "Please take a few minutes to share feedback about your experience. Your responses help us improve care and service for all patients.",
          "",
          `Complete the survey: ${link}`,
          "",
          signOff,
        ].join("\n"),
      };
    case "reminder1":
      return {
        subject: "Reminder: Share your NMAC visit feedback",
        textBody: [
          greeting(patientName),
          "",
          "We recently invited you to complete a short survey about your visit to NMAC. We have not received your response yet.",
          "",
          "It only takes a few minutes and your feedback makes a real difference.",
          "",
          `Complete the survey: ${link}`,
          "",
          signOff,
        ].join("\n"),
      };
    case "reminder2":
      return {
        subject: "Second reminder: NMAC provider experience survey",
        textBody: [
          greeting(patientName),
          "",
          "This is a friendly reminder to share your feedback about your recent visit to NMAC.",
          "",
          `Complete the survey: ${link}`,
          "",
          signOff,
        ].join("\n"),
      };
    case "final":
      return {
        subject: "Final reminder: NMAC visit survey",
        textBody: [
          greeting(patientName),
          "",
          "This is our final reminder to complete the brief survey about your recent visit to NMAC.",
          "",
          `Complete the survey: ${link}`,
          "",
          signOff,
        ].join("\n"),
      };
  }
}
