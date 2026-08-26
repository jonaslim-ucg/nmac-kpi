import assert from "node:assert/strict";
import test from "node:test";
import {
  TESTIMONIAL_PERMISSION_OPTIONS,
  isTestimonialComplete,
  isTestimonialPermissionGranted,
  shouldRequestTestimonialPermission,
} from "../../lib/appointment-review/types.ts";

test("uses the requested named testimonial permission wording", () => {
  assert.equal(
    TESTIMONIAL_PERMISSION_OPTIONS[0]?.label,
    "Yes, I give Northshore Medical & Aesthetics Center permission to use my comments with my name.",
  );
  assert.equal(
    TESTIMONIAL_PERMISSION_OPTIONS[2]?.label,
    "No, I prefer my feedback to remain confidential.",
  );
});

test("keeps the testimonial optional and requests permission only when text is entered", () => {
  assert.equal(isTestimonialPermissionGranted("yes-named"), true);
  assert.equal(isTestimonialPermissionGranted("yes-anonymous"), true);
  assert.equal(shouldRequestTestimonialPermission(""), false);
  assert.equal(shouldRequestTestimonialPermission("   "), false);
  assert.equal(isTestimonialComplete(null, ""), true);
  assert.equal(isTestimonialComplete(null, "   "), true);
  assert.equal(shouldRequestTestimonialPermission("The team took excellent care of me."), true);
  assert.equal(isTestimonialComplete(null, "The team took excellent care of me."), false);
  assert.equal(isTestimonialComplete("yes-named", "The team took excellent care of me."), true);
  assert.equal(isTestimonialComplete("confidential", "The team took excellent care of me."), true);
});

test("keeps confidential feedback unavailable for marketing use", () => {
  assert.equal(isTestimonialPermissionGranted("confidential"), false);
});
