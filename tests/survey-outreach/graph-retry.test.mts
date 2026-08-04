import assert from "node:assert/strict";
import test from "node:test";

import {
  graphRetryAfterMs,
  graphRetryDelayMs,
  isRetryableGraphReadStatus,
} from "../../lib/graph/retry.ts";

test("uses Microsoft retry headers before exponential backoff", () => {
  assert.equal(graphRetryAfterMs(new Headers({ "retry-after": "7" })), 7_000);
  assert.equal(graphRetryAfterMs(new Headers({ "x-ms-retry-after-ms": "3500" })), 3_500);
  assert.equal(graphRetryDelayMs(new Headers({ "retry-after": "7" }), 0), 7_000);
  assert.equal(graphRetryDelayMs(new Headers(), 2), 8_000);
});

test("parses an HTTP-date retry header", () => {
  const now = Date.parse("2026-08-05T00:00:00.000Z");
  const headers = new Headers({ "retry-after": "Wed, 05 Aug 2026 00:00:05 GMT" });
  assert.equal(graphRetryAfterMs(headers, now), 5_000);
});

test("retries throttling and transient Graph read failures", () => {
  assert.equal(isRetryableGraphReadStatus(429), true);
  assert.equal(isRetryableGraphReadStatus(503), true);
  assert.equal(isRetryableGraphReadStatus(404), false);
});
