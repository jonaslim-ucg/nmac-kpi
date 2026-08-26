import assert from "node:assert/strict";
import test from "node:test";
import type { AppointmentReviewDetail } from "../../lib/appointment-review/display.ts";
import {
  appointmentReviewPdfFileName,
  buildAppointmentReviewPdf,
  normalizePdfText,
} from "../../lib/appointment-review/pdf-report.ts";

function review(id: string, overrides: Partial<AppointmentReviewDetail> = {}): AppointmentReviewDetail {
  return {
    id,
    isTest: false,
    createdAt: "2026-08-26T18:30:00.000Z",
    appointmentDate: "2026-08-25",
    appointmentAt: "2026-08-25T14:00:00.000Z",
    appointmentProviderNames: ["Dr. Kyjuan Brown"],
    appointmentVisitTypes: ["Medical follow-up"],
    email: "sample.patient@example.com",
    patientName: "Patient, Sample",
    appointmentEase: 5,
    visitRating: 4,
    serviceTypeLabel: "Dr. Kyjuan Brown",
    providerRating: 5,
    providerRatings: [{ providerLabel: "Dr. Kyjuan Brown", rating: 5 }],
    healthRating: 4,
    confidenceRating: null,
    qualityOfLifeRating: null,
    healthImprovementComment: "I feel more confident managing my care.",
    recommendationRating: 5,
    wouldEncouragePatient: null,
    recommendationMessage: "I would recommend the practice to my family.",
    testimonialPermission: "yes-anonymous",
    testimonialPermissionLabel: "Yes, but please do not use my name.",
    testimonialText: "The team listened carefully and explained each next step.",
    waitTimeLabel: "0-5 minutes",
    providerTimeAdequate: true,
    providerTimeComment: "My questions were answered.",
    frontDeskRating: 5,
    isNewPatient: false,
    patientDurationLabel: "1-4 years",
    referralSources: [],
    referralSourcesLabel: null,
    referralOther: "",
    exceptionalStaffComment: "The front desk team was welcoming.",
    hasComments: true,
    commentPreview: "The team listened carefully and explained each next step.",
    feedbackManagement: {
      responsiblePerson: "Marketing Team",
      assignedToEmail: "marketing@example.com",
      status: "in_progress",
      notes: "Confirm permission before publication.",
      updatedAt: "2026-08-26T19:00:00.000Z",
      updatedBy: "manager@example.com",
    },
    ...overrides,
  };
}

test("normalizes unsupported PDF punctuation without losing readable text", () => {
  assert.equal(normalizePdfText("Jos\u00e9 \u2014 \u201cExcellent care\u201d \ud83d\udc4f"), 'Jose - "Excellent care"');
  assert.equal(normalizePdfText("   "), "Not provided");
});

test("creates a stable PDF filename for the selected report period", () => {
  assert.equal(
    appointmentReviewPdfFileName("Jul 22, 2026 - Aug 26, 2026"),
    "nmac-survey-report-jul-22-2026-aug-26-2026.pdf",
  );
});

test("builds a multi-page survey report with one section per response", () => {
  const doc = buildAppointmentReviewPdf({
    reviews: [review("one"), review("two", { patientName: "Patient, Second", isTest: true })],
    periodLabel: "Aug 1, 2026 - Aug 26, 2026",
    reportTitle: "Provider Experience Survey Report",
    filterSummary: ["Visit type: Medical follow-up", "Rating: 4.0-5.0"],
    sortLabel: "Submitted: newest",
    generatedAt: new Date("2026-08-27T01:00:00.000Z"),
    logoData: null,
  });

  assert.ok(doc.getNumberOfPages() >= 3);
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.ok(bytes.byteLength > 5_000);
});

test("continues a long testimonial onto additional pages without throwing", () => {
  const longAnswer = Array.from(
    { length: 120 },
    (_, index) => `Response detail ${index + 1} explains the patient's experience clearly.`,
  ).join(" ");
  const doc = buildAppointmentReviewPdf({
    reviews: [review("long", { testimonialText: longAnswer })],
    periodLabel: "Current quarter",
    generatedAt: new Date("2026-08-27T01:00:00.000Z"),
    logoData: null,
  });

  assert.ok(doc.getNumberOfPages() >= 3);
  assert.doesNotThrow(() => doc.output("arraybuffer"));
});
