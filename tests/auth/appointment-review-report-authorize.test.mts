import assert from "node:assert/strict";
import test from "node:test";
import { bearerAuthorizationMatchesSecret } from "../../lib/appointment-review/authorize.ts";

const SECRET = "test-only-appointment-report-secret-that-is-at-least-32-characters";

test("accepts the configured appointment report bearer key", () => {
  assert.equal(bearerAuthorizationMatchesSecret(`Bearer ${SECRET}`, SECRET), true);
});

test("rejects missing, malformed, and incorrect appointment report keys", () => {
  assert.equal(bearerAuthorizationMatchesSecret(null, SECRET), false);
  assert.equal(bearerAuthorizationMatchesSecret(SECRET, SECRET), false);
  assert.equal(bearerAuthorizationMatchesSecret("Bearer wrong", SECRET), false);
  assert.equal(bearerAuthorizationMatchesSecret(`Basic ${SECRET}`, SECRET), false);
  assert.equal(bearerAuthorizationMatchesSecret(`Bearer ${SECRET}`, undefined), false);
});
