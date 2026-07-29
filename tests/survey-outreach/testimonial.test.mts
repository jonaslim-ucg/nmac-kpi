import assert from "node:assert/strict";
import test from "node:test";
import {
  isTestimonialComplete,
  isTestimonialPermissionGranted,
} from "../../lib/appointment-review/types.ts";

test("shows and requires testimonial text for either consent option", () => {
  assert.equal(isTestimonialPermissionGranted("yes-named"), true);
  assert.equal(isTestimonialPermissionGranted("yes-anonymous"), true);
  assert.equal(isTestimonialComplete("yes-named", ""), false);
  assert.equal(isTestimonialComplete("yes-anonymous", "   "), false);
  assert.equal(isTestimonialComplete("yes-named", "The team took excellent care of me."), true);
});

test("does not require testimonial text when feedback remains confidential", () => {
  assert.equal(isTestimonialPermissionGranted("confidential"), false);
  assert.equal(isTestimonialComplete("confidential", ""), true);
  assert.equal(isTestimonialComplete(null, ""), false);
});
