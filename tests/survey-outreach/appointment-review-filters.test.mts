import assert from "node:assert/strict";
import test from "node:test";
import type { AppointmentReviewDetail } from "../../lib/appointment-review/display.ts";
import {
  countActiveAppointmentReviewFilters,
  DEFAULT_APPOINTMENT_REVIEW_FILTERS,
  filterAppointmentReviews,
  getAppointmentReviewAverageRating,
  getAppointmentReviewFilterOptions,
} from "../../lib/appointment-review/filters.ts";

function review(
  overrides: Partial<AppointmentReviewDetail> & Pick<AppointmentReviewDetail, "id">,
): AppointmentReviewDetail {
  const { id, ...rest } = overrides;
  return {
    id,
    isTest: false,
    createdAt: "2026-08-25T12:00:00.000Z",
    appointmentDate: "2026-08-24",
    appointmentAt: "2026-08-24T13:00:00.000Z",
    appointmentProviderNames: ["Dr. Kyjuan Brown"],
    appointmentVisitTypes: ["Medical follow-up"],
    email: "patient@example.com",
    patientName: "Patient, Example",
    appointmentEase: 5,
    visitRating: 5,
    serviceTypeLabel: "Dr. Kyjuan Brown",
    providerRating: 5,
    providerRatings: [{ providerLabel: "Dr. Kyjuan Brown", rating: 5 }],
    healthRating: 5,
    confidenceRating: null,
    qualityOfLifeRating: null,
    healthImprovementComment: "",
    recommendationRating: 5,
    wouldEncouragePatient: null,
    recommendationMessage: "",
    testimonialPermission: null,
    testimonialPermissionLabel: "—",
    testimonialText: "",
    waitTimeLabel: "0–5 minutes",
    providerTimeAdequate: true,
    providerTimeComment: "",
    frontDeskRating: 5,
    isNewPatient: false,
    patientDurationLabel: "1–4 years",
    referralSources: [],
    referralSourcesLabel: null,
    referralOther: "",
    exceptionalStaffComment: "",
    hasComments: false,
    commentPreview: null,
    feedbackManagement: {
      responsiblePerson: "Patricia Galeza",
      assignedToEmail: "patricia.galeza@ucg.bm",
      status: "actioned",
      notes: "",
      updatedAt: null,
      updatedBy: null,
    },
    ...rest,
  };
}

const highRatingReview = review({ id: "high", patientName: "Adams, Jane" });
const lowRatingReview = review({
  id: "low",
  patientName: "Brown, John",
  appointmentProviderNames: [],
  appointmentVisitTypes: ["Blood work"],
  serviceTypeLabel: "Dr. Paula Estwick",
  providerRating: 2,
  providerRatings: [{ providerLabel: "Dr. Paula Estwick", rating: 2 }],
  appointmentEase: 2,
  visitRating: 2,
  healthRating: 2,
  recommendationRating: 2,
  frontDeskRating: 2,
  feedbackManagement: undefined,
});

test("builds sorted filter lists from displayed review values", () => {
  assert.deepEqual(getAppointmentReviewFilterOptions([lowRatingReview, highRatingReview]), {
    patientNames: ["Adams, Jane", "Brown, John"],
    visitTypes: ["Blood work", "Medical follow-up"],
    handlers: ["Patricia Galeza", "Unassigned"],
    providers: ["Dr. Kyjuan Brown", "Dr. Paula Estwick"],
  });
});

test("filters by patient, visit type, handler, provider, and handling resolution", () => {
  const reviews = [highRatingReview, lowRatingReview];
  const cases = [
    { patientName: "Adams, Jane" },
    { visitType: "Medical follow-up" },
    { handler: "Patricia Galeza" },
    { provider: "Dr. Kyjuan Brown" },
    { resolution: "actioned" as const },
  ];

  for (const selected of cases) {
    const filtered = filterAppointmentReviews(reviews, {
      ...DEFAULT_APPOINTMENT_REVIEW_FILTERS,
      ...selected,
    });
    assert.deepEqual(filtered.map((item) => item.id), ["high"]);
  }

  assert.deepEqual(
    filterAppointmentReviews(reviews, {
      ...DEFAULT_APPOINTMENT_REVIEW_FILTERS,
      handler: "Unassigned",
      resolution: "needs_review",
    }).map((item) => item.id),
    ["low"],
  );
});

test("uses the displayed average for inclusive rating-range filtering", () => {
  assert.equal(getAppointmentReviewAverageRating(highRatingReview), 5);
  assert.equal(getAppointmentReviewAverageRating(lowRatingReview), 2);

  const filtered = filterAppointmentReviews([highRatingReview, lowRatingReview], {
    ...DEFAULT_APPOINTMENT_REVIEW_FILTERS,
    ratingMin: 4.5,
    ratingMax: 5,
  });
  assert.deepEqual(filtered.map((item) => item.id), ["high"]);
});

test("counts each selected category and the rating range once", () => {
  assert.equal(countActiveAppointmentReviewFilters(DEFAULT_APPOINTMENT_REVIEW_FILTERS), 0);
  assert.equal(countActiveAppointmentReviewFilters({
    ...DEFAULT_APPOINTMENT_REVIEW_FILTERS,
    patientName: "Adams, Jane",
    provider: "Dr. Kyjuan Brown",
    ratingMin: 4,
    ratingMax: 5,
  }), 3);
});
